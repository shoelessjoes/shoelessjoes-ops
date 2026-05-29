import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRow = await prisma.shop.findUnique({ where: { shopifyDomain: session.shop } });
  if (!shopRow) return json({ alerts: [] });
  const alerts = await prisma.priceAlert.findMany({
    where: { shopId: shopRow.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return json({ alerts });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRow = await prisma.shop.upsert({
    where: { shopifyDomain: session.shop },
    create: { shopifyDomain: session.shop, accessToken: session.accessToken },
    update: { accessToken: session.accessToken },
  });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "create");

  if (intent === "delete") {
    const id = String(form.get("id") ?? "");
    if (!id) return json({ ok: false }, { status: 400 });
    await prisma.priceAlert.deleteMany({ where: { id, shopId: shopRow.id } });
    return redirect("/app/alerts");
  }

  const upc = String(form.get("upc") ?? "").trim() || null;
  const alertType = String(form.get("alertType") ?? "Wanted");
  const price = Number(String(form.get("price") ?? "0"));
  if (!Number.isFinite(price) || price <= 0) return json({ ok: false }, { status: 400 });

  await prisma.priceAlert.create({
    data: {
      shopId: shopRow.id,
      upc,
      alertType,
      price: String(price),
    },
  });

  return redirect("/app/alerts");
};

export default function AlertsPage() {
  const { alerts } = useLoaderData<typeof loader>();
  return (
    <div>
      <h1>Price alerts (Dealernet)</h1>
      <p>Queue alert rows here; worker automation can read this table to sync into Dealernet.</p>
      <Form method="post" style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input name="upc" placeholder="UPC (optional)" />
        <select name="alertType" defaultValue="Wanted">
          <option>Wanted</option>
          <option>For Sale</option>
        </select>
        <input name="price" type="number" step="0.01" placeholder="Price" required />
        <button type="submit">Add alert</button>
      </Form>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>UPC</th>
            <th>Price</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={a.id}>
              <td>{a.alertType}</td>
              <td>{a.upc ?? ""}</td>
              <td>{String(a.price)}</td>
              <td>{new Date(a.updatedAt).toLocaleString()}</td>
              <td>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit">Delete</button>
                </Form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
