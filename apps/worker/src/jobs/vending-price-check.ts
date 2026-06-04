/**
 * Full vending price check: Shopify sealed catalog (price + inventory qty)
 * vs Zhongda machine sell prices. Safe to schedule 2–4×/day.
 */
import { prisma } from "@dealernet-ops/db";
import {
  formatPriceCheckReport,
  maybeEmailPriceCheckReport,
  runVendingPriceCheck,
} from "../vending-pipeline.js";
import { getOrCreateShopFromEnv } from "../shop.js";

async function main() {
  const shop = await getOrCreateShopFromEnv();
  const jobRun = await prisma.jobRun.create({
    data: { shopId: shop.id, jobName: "vending-price-check", status: "running" },
  });

  try {
    const result = await runVendingPriceCheck(shop);
    console.log("\n" + formatPriceCheckReport(result));

    await maybeEmailPriceCheckReport(result);

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        metaJson: {
          catalogRows: result.catalogRows,
          linked: result.linked,
          unmatched: result.unmatched,
          diffCount: result.diffs.length,
        },
      },
    });

    if (result.diffs.length > 0) process.exitCode = 2;
  } catch (e) {
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: e instanceof Error ? e.message : String(e),
      },
    });
    throw e;
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
