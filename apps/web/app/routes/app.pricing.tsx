import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { recommendPriceAction } from "@dealernet-ops/core";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRow = await prisma.shop.findUnique({ where: { shopifyDomain: session.shop } });
  if (!shopRow) return json({ rows: [] });
  const rows = await prisma.priceRecommendation.findMany({
    where: { shopId: shopRow.id },
    orderBy: { computedAt: "desc" },
    take: 50,
  });
  return json({ rows });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRow = await prisma.shop.upsert({
    where: { shopifyDomain: session.shop },
    create: { shopifyDomain: session.shop, accessToken: session.accessToken },
    update: { accessToken: session.accessToken },
  });

  const form = await request.formData();
  const shopifyPrice = Number(String(form.get("shopifyPrice") ?? ""));
  const highBuy = form.get("highBuy") ? Number(String(form.get("highBuy"))) : null;
  const lowSell = form.get("lowSell") ? Number(String(form.get("lowSell"))) : null;
  const sold30d = Number(String(form.get("sold30d") ?? "0"));
  const title = String(form.get("title") ?? "Sample");

  const rec = recommendPriceAction({
    shopifyPrice: Number.isFinite(shopifyPrice) ? shopifyPrice : null,
    shopifyCost: null,
    inventoryQty: 5,
    highBuy: highBuy != null && Number.isFinite(highBuy) ? highBuy : null,
    lowSell: lowSell != null && Number.isFinite(lowSell) ? lowSell : null,
    sold30d,
  });

  await prisma.priceRecommendation.create({
    data: {
      shopId: shopRow.id,
      variantId: "manual",
      barcode: null,
      title,
      shopifyPrice: String(shopifyPrice),
      highBuy: highBuy != null ? String(highBuy) : null,
      lowSell: lowSell != null ? String(lowSell) : null,
      sold30d,
      action: rec.action,
      suggestedPrice: rec.suggestedPrice != null ? String(rec.suggestedPrice) : null,
      rationale: rec.rationale,
    },
  });

  return redirect("/app/pricing");
};

export default function PricingPage() {
  const { rows } = useLoaderData<typeof loader>();
  return (
    <div>
      <h1>Pricing recommendations</h1>
      <p>Uses the ported Dealernet bid/ask rules from <code>@dealernet-ops/core</code>.</p>
      <h2>Try a row</h2>
      <Form method="post" style={{ display: "grid", gap: "0.5rem", maxWidth: "420px" }}>
        <input name="title" placeholder="Title" defaultValue="Test product" />
        <input name="shopifyPrice" type="number" step="0.01" placeholder="Your price" required />
        <input name="highBuy" type="number" step="0.01" placeholder="Dealernet high bid" />
        <input name="lowSell" type="number" step="0.01" placeholder="Dealernet low ask" />
        <input name="sold30d" type="number" placeholder="Sold 30d" defaultValue={0} />
        <button type="submit">Compute & save</button>
      </Form>
      <h2>Recent saved</h2>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Title</th>
            <th>Action</th>
            <th>Suggested</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.computedAt).toLocaleString()}</td>
              <td>{r.title}</td>
              <td>{r.action}</td>
              <td>{r.suggestedPrice != null ? String(r.suggestedPrice) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
