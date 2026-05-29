import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRow = await prisma.shop.findUnique({ where: { shopifyDomain: session.shop } });
  const pending = shopRow
    ? await prisma.dealernetOfferLine.count({
        where: { shopId: shopRow.id, mappingStatus: "pending" },
      })
    : 0;
  const runs = shopRow
    ? await prisma.shopifySyncRun.findMany({
        where: { shopId: shopRow.id },
        orderBy: { startedAt: "desc" },
        take: 5,
      })
    : [];
  return json({ pending, runs });
};

export default function AppHome() {
  const { pending, runs } = useLoaderData<typeof loader>();
  return (
    <div>
      <h1>Dashboard</h1>
      <p>
        <strong>{pending}</strong> offer lines need product mapping before sync can attach line items.
      </p>
      <h2>Recent sync runs</h2>
      <table>
        <thead>
          <tr>
            <th>Started</th>
            <th>Mode</th>
            <th>Dry run</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.startedAt).toLocaleString()}</td>
              <td>{r.mode}</td>
              <td>{r.dryRun ? "yes" : "no"}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
