import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { normalizeDealernetTitle } from "@dealernet-ops/core";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRow = await prisma.shop.findUnique({ where: { shopifyDomain: session.shop } });
  if (!shopRow) return json({ lines: [] });
  const lines = await prisma.dealernetOfferLine.findMany({
    where: { shopId: shopRow.id, mappingStatus: "pending" },
    orderBy: { capturedAt: "desc" },
    take: 100,
    include: { dealernetOffer: true },
  });
  return json({ lines });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRow = await prisma.shop.findUnique({ where: { shopifyDomain: session.shop } });
  if (!shopRow) return json({ ok: false }, { status: 400 });

  const form = await request.formData();
  const lineId = String(form.get("lineId") ?? "");
  const variantId = String(form.get("variantId") ?? "").trim();
  if (!lineId || !variantId) return json({ ok: false }, { status: 400 });

  const line = await prisma.dealernetOfferLine.findFirst({
    where: { id: lineId, shopId: shopRow.id },
  });
  if (!line) return json({ ok: false }, { status: 404 });

  await prisma.productMappingOverride.upsert({
    where: {
      shopId_dealernetTitleNorm: {
        shopId: shopRow.id,
        dealernetTitleNorm: normalizeDealernetTitle(line.title),
      },
    },
    create: {
      shopId: shopRow.id,
      upc: line.upc,
      dealernetTitleNorm: normalizeDealernetTitle(line.title),
      variantId,
      note: "manual-approve-ui",
    },
    update: { variantId, upc: line.upc },
  });

  await prisma.dealernetOfferLine.update({
    where: { id: line.id },
    data: {
      mappingStatus: "approved",
      matchedVariantId: variantId,
    },
  });

  return redirect("/app/mapping");
};

export default function MappingPage() {
  const { lines } = useLoaderData<typeof loader>();
  return (
    <div>
      <h1>Mapping queue</h1>
      <p>Approve a Shopify variant ID for each Dealernet line. Auto-create stays off by default.</p>
      <table>
        <thead>
          <tr>
            <th>Offer</th>
            <th>Title</th>
            <th>UPC</th>
            <th>Qty</th>
            <th>Variant ID</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>{l.offerId}</td>
              <td>{l.title}</td>
              <td>{l.upc ?? ""}</td>
              <td>{l.qty}</td>
              <td>
                <Form method="post">
                  <input type="hidden" name="lineId" value={l.id} />
                  <input name="variantId" placeholder="gid or numeric id" required style={{ width: "160px" }} />
                  <button type="submit">Save</button>
                </Form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
