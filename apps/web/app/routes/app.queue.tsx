import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

const STAGE_ORDER = ["ordered", "in_transit", "delivered", "received", "cancelled"] as const;

function stageRank(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
  return i >= 0 ? i : 99;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const direction = url.searchParams.get("direction") || "inbound";
  const stage = url.searchParams.get("stage");

  const lines = await prisma.inboundLine.findMany({
    where: {
      direction,
      ...(stage ? { stage } : { stage: { not: "cancelled" } }),
    },
    orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });

  lines.sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || b.updatedAt.getTime() - a.updatedAt.getTime());

  const counts = await prisma.inboundLine.groupBy({
    by: ["stage"],
    where: { direction },
    _count: { _all: true },
  });

  return json({ lines, counts, direction, stage });
};

export default function InboundQueuePage() {
  const { lines, counts, direction, stage } = useLoaderData<typeof loader>();

  return (
    <div>
      <h1>Inbound queue</h1>
      <p style={{ color: "#666", maxWidth: "42rem" }}>
        Unified on-order view from Dealernet (and vendor email later). Populated after{" "}
        <code>job:ingest-offers</code>. Receive scan UI is a follow-on.
      </p>
      <div style={{ margin: "1rem 0", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <a href="/app/queue?direction=inbound" style={{ fontWeight: direction === "inbound" ? 700 : 400 }}>
          Inbound purchases
        </a>
        <a href="/app/queue?direction=outbound" style={{ fontWeight: direction === "outbound" ? 700 : 400 }}>
          Outbound sales
        </a>
        {counts.map((c) => (
          <span key={c.stage} style={{ color: "#666" }}>
            {c.stage}: {c._count._all}
          </span>
        ))}
      </div>
      {stage ? (
        <p>
          Filter: <code>{stage}</code> — <a href={`/app/queue?direction=${direction}`}>clear</a>
        </p>
      ) : null}
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.9rem" }}>
        <thead>
          <tr>
            <th align="left">Stage</th>
            <th align="left">Source</th>
            <th align="left">Offer #</th>
            <th align="left">Title</th>
            <th align="left">UPC</th>
            <th align="right">Rcvd/Ord</th>
            <th align="right">Cost</th>
            <th align="left">Tracking</th>
            <th align="left">Dealer</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ padding: "1rem", color: "#666" }}>
                No lines — run <code>npm run job:ingest-offers</code> with accepted Dealernet offers.
              </td>
            </tr>
          ) : (
            lines.map((line) => (
              <tr key={line.id} style={{ borderTop: "1px solid #ddd" }}>
                <td>
                  <a href={`/app/queue?direction=${direction}&stage=${line.stage}`}>{line.stage}</a>
                </td>
                <td>{line.source}</td>
                <td>{line.externalId ?? "—"}</td>
                <td>{line.title}</td>
                <td>{line.upc ?? "—"}</td>
                <td align="right">
                  {line.qtyReceived}/{line.qtyOrdered}
                </td>
                <td align="right">{line.unitCost?.toString() ?? "—"}</td>
                <td>{line.tracking ?? "—"}</td>
                <td>{line.dealer ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
