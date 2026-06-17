import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

function cleanMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUpc(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

function lookupKeyForInput(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const upc = normalizeUpc(s);
  if (upc) return `upc:${upc}`;
  return `q:${cleanMatch(s)}`;
}

async function lookupInput(input: string) {
  const key = lookupKeyForInput(input);
  const row =
    (await prisma.dealernetMarketProduct.findUnique({ where: { canonicalKey: key } })) ??
    (normalizeUpc(input)
      ? await prisma.dealernetMarketProduct.findFirst({ where: { upc: normalizeUpc(input)! } })
      : null) ??
    (await prisma.dealernetMarketProduct.findFirst({
      where: { title: { contains: input, mode: "insensitive" } },
      orderBy: { scrapedAt: "desc" },
    }));
  return { input, lookupKey: key, row };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const count = await prisma.dealernetMarketProduct.count();
  return json({ count });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const text = String(form.get("lines") ?? "");
  const inputs = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const results = [];
  for (const input of inputs) {
    results.push(await lookupInput(input));
  }
  return json({ results });
};

export default function MarketLookupPage() {
  const actionData = useActionData<typeof action>();
  return (
    <div>
      <h1>Market lookup</h1>
      <p style={{ color: "#666", maxWidth: "40rem" }}>
        Paste rough product names or UPCs (one per line). Matches the Dealernet market cache in
        Postgres. Run <code>resolve-market-list.py</code> in supplier-py for misses, then{" "}
        <code>npm run job:import-market-catalog</code>.
      </p>
      <Form method="post">
        <textarea
          name="lines"
          rows={12}
          cols={60}
          placeholder={"2020 Bowman Baseball Hobby\n887521088034"}
          style={{ display: "block", marginBottom: "0.75rem", fontFamily: "monospace" }}
        />
        <button type="submit">Lookup in database</button>
      </Form>
      {actionData?.results?.length ? (
        <table style={{ marginTop: "1.5rem", borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th align="left">Input</th>
              <th align="left">Title</th>
              <th align="left">UPC</th>
              <th align="right">High buy</th>
              <th align="right">Low sell</th>
              <th align="left">Status</th>
            </tr>
          </thead>
          <tbody>
            {actionData.results.map((r) => (
              <tr key={r.input} style={{ borderTop: "1px solid #ddd" }}>
                <td>{r.input}</td>
                <td>{r.row?.title ?? "—"}</td>
                <td>{r.row?.upc ?? "—"}</td>
                <td align="right">{r.row?.highBuy?.toString() ?? "—"}</td>
                <td align="right">{r.row?.lowSell?.toString() ?? "—"}</td>
                <td>{r.row ? "found" : "missing — run resolve script"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
};
