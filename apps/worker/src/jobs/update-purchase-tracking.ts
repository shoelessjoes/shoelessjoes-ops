import {
  buildPurchaseDraftTags,
  findDraftOrderIdByOfferTag,
  updateDraftOrderMetadata,
} from "@dealernet-ops/core";
import { prisma } from "@dealernet-ops/db";
import { optionalEnv, requireEnv } from "../env.js";
import { getOrCreateShopFromEnv } from "../shop.js";

const PURCHASE_FILTER = "PURCHASESUNRATED";

function parseArgs() {
  const execute = process.argv.includes("--execute");
  return { dryRun: !execute };
}

async function main() {
  const { dryRun } = parseArgs();
  const shop = await getOrCreateShopFromEnv();
  const accessToken = (shop.accessToken && shop.accessToken.trim()) || requireEnv("SHOPIFY_ACCESS_TOKEN");
  const apiVersion = optionalEnv("SHOPIFY_API_VERSION") ?? "2024-10";
  const session = { shopDomain: shop.shopifyDomain, accessToken, apiVersion };

  const lines = await prisma.dealernetOfferLine.findMany({
    where: {
      shopId: shop.id,
      offerFilter: PURCHASE_FILTER,
      trackingNumber: { not: null },
      dealernetOffer: { status: { equals: "ACCEPTED", mode: "insensitive" } },
    },
    include: { dealernetOffer: true },
  });

  const byOffer = new Map<string, typeof lines>();
  for (const line of lines) {
    const list = byOffer.get(line.offerId) ?? [];
    list.push(line);
    byOffer.set(line.offerId, list);
  }

  let updated = 0;
  let missingDraft = 0;
  let skipped = 0;

  for (const [offerId, offerLines] of byOffer) {
    const head = offerLines[0].dealernetOffer;
    const tracking =
      offerLines.map((l) => l.trackingNumber).find((t) => t && t.trim())?.trim() ?? null;
    if (!tracking) {
      skipped += 1;
      continue;
    }

    const noteParts = [`Dealernet offer ${offerId} (purchase)`];
    if (head.dealer) noteParts.push(`Dealer: ${head.dealer}`);
    if (head.createdAtDn) noteParts.push(`Created: ${head.createdAtDn}`);
    noteParts.push(`Tracking: ${tracking}`);
    const note = noteParts.join(" | ");
    const tags = buildPurchaseDraftTags(offerId, tracking);

    if (dryRun) {
      console.log(`[dry-run] would update draft for offer #${offerId} tracking=${tracking}`);
      updated += 1;
      continue;
    }

    const draftId = await findDraftOrderIdByOfferTag(session, offerId);
    if (!draftId) {
      console.warn(`No Shopify draft order tagged offer-${offerId}; run sync-offers purchase first`);
      missingDraft += 1;
      continue;
    }

    await updateDraftOrderMetadata(session, draftId, note, tags);
    console.log(`Updated draft order ${draftId} for offer #${offerId} tracking=${tracking}`);
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        offersWithTracking: byOffer.size,
        updated,
        missingDraft,
        skipped,
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
