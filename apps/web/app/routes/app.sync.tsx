import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRow = await prisma.shop.findUnique({ where: { shopifyDomain: session.shop } });
  if (!shopRow) return json({ runs: [], events: [] });
  const runs = await prisma.shopifySyncRun.findMany({
    where: { shopId: shopRow.id },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  const runIds = runs.map((r) => r.id);
  const events =
    runIds.length > 0
      ? await prisma.shopifySyncEvent.findMany({
          where: { syncRunId: { in: runIds } },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];
  return json({ runs, events });
};

export default function SyncPage() {
  const { runs, events } = useLoaderData<typeof loader>();
  return (
    <div>
      <h1>Sync runs</h1>
      <p>Worker jobs write here. Use <code>npm run job:sync-offers</code> in the worker package.</p>
      <h2>Runs</h2>
      <table>
        <thead>
          <tr>
            <th>Started</th>
            <th>Mode</th>
            <th>Dry</th>
            <th>Status</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.startedAt).toLocaleString()}</td>
              <td>{r.mode}</td>
              <td>{r.dryRun ? "yes" : "no"}</td>
              <td>{r.status}</td>
              <td>{r.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Events</h2>
      <table>
        <thead>
          <tr>
            <th>Offer</th>
            <th>Mode</th>
            <th>Status</th>
            <th>Draft</th>
            <th>Order</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{e.offerId}</td>
              <td>{e.mode}</td>
              <td>{e.status}</td>
              <td>{e.shopifyDraftOrderId ?? ""}</td>
              <td>{e.shopifyOrderId ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
