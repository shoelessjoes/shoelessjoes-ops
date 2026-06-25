import { prisma } from "@dealernet-ops/db";
import { getOrCreateShopFromEnv } from "../shop.js";
import { syncDealernetInboundLines } from "../inbound/sync-dealernet.js";

function parseArgs() {
  const execute = process.argv.includes("--execute");
  return { dryRun: !execute };
}

async function main() {
  const { dryRun } = parseArgs();
  const shop = await getOrCreateShopFromEnv();

  if (dryRun) {
    const withTracking = await prisma.inboundLine.count({
      where: {
        shopId: shop.id,
        direction: "inbound",
        tracking: { not: null },
        stage: { in: ["ordered", "in_transit"] },
      },
    });
    console.log(
      `[dry-run] Would refresh InboundLine from Dealernet offer lines (${withTracking} inbound with tracking)`,
    );
    return;
  }

  const result = await syncDealernetInboundLines(shop.id);
  const inTransit = await prisma.inboundLine.count({
    where: { shopId: shop.id, direction: "inbound", stage: "in_transit" },
  });

  console.log(
    JSON.stringify(
      {
        dryRun: false,
        upserted: result.upserted,
        cancelled: result.cancelled,
        inboundInTransit: inTransit,
        note: "Tracking lives on InboundLine; no Shopify draft orders for purchases.",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
