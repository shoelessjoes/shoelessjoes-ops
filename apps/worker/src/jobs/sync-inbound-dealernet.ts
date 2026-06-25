import { prisma } from "@dealernet-ops/db";
import { getOrCreateShopFromEnv } from "../shop.js";
import { syncDealernetInboundLines } from "../inbound/sync-dealernet.js";

async function main() {
  const shop = await getOrCreateShopFromEnv();
  const result = await syncDealernetInboundLines(shop.id);
  console.log(`Synced inbound queue: ${result.upserted} line(s), ${result.cancelled} cancelled`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
