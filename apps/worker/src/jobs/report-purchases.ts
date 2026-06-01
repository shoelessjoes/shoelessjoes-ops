import {
  fetchVariantIndex,
  matchOfferLineToVariant,
  type SyncOfferLineInput,
} from "@dealernet-ops/core";
import { prisma } from "@dealernet-ops/db";
import { optionalEnv, requireEnv } from "../env.js";
import { getOrCreateShopFromEnv } from "../shop.js";

const PURCHASE_FILTER = "PURCHASESUNRATED";

async function main() {
  const shop = await getOrCreateShopFromEnv();
  const acceptedOnly = !process.argv.includes("--all-statuses");
  const skipShopify = process.argv.includes("--no-shopify");

  const lines = await prisma.dealernetOfferLine.findMany({
    where: {
      shopId: shop.id,
      offerFilter: PURCHASE_FILTER,
      ...(acceptedOnly
        ? { dealernetOffer: { status: { equals: "ACCEPTED", mode: "insensitive" } } }
        : {}),
    },
    include: { dealernetOffer: true },
    orderBy: [{ offerId: "asc" }, { title: "asc" }],
  });

  let index: Awaited<ReturnType<typeof fetchVariantIndex>> = [];
  const overridesRows = await prisma.productMappingOverride.findMany({ where: { shopId: shop.id } });
  const overrides = new Map<string, string>();
  for (const o of overridesRows) {
    if (o.upc) overrides.set(`upc:${o.upc}`, o.variantId);
    overrides.set(`title:${o.dealernetTitleNorm}`, o.variantId);
  }

  if (!skipShopify) {
    const accessToken = (shop.accessToken && shop.accessToken.trim()) || requireEnv("SHOPIFY_ACCESS_TOKEN");
    const apiVersion = optionalEnv("SHOPIFY_API_VERSION") ?? "2024-10";
    index = await fetchVariantIndex({
      shopDomain: shop.shopifyDomain,
      accessToken,
      apiVersion,
    });
    console.log(`Shopify variant index: ${index.length} variants loaded`);
  } else {
    console.log("Skipping Shopify match (--no-shopify)");
  }

  const byOffer = new Map<string, typeof lines>();
  for (const line of lines) {
    const list = byOffer.get(line.offerId) ?? [];
    list.push(line);
    byOffer.set(line.offerId, list);
  }

  let mapped = 0;
  let missing = 0;
  let withTracking = 0;

  console.log("");
  console.log(
    `Purchase offers in DB: ${byOffer.size} offers, ${lines.length} lines${
      acceptedOnly ? " (ACCEPTED only; pass --all-statuses for all)" : ""
    }`,
  );
  console.log("");

  for (const [offerId, offerLines] of byOffer) {
    const head = offerLines[0].dealernetOffer;
    const tracking = offerLines.find((l) => l.trackingNumber)?.trackingNumber ?? null;
    if (tracking) withTracking += 1;

    console.log(
      `Offer #${offerId} | ${head.status} | dealer=${head.dealer ?? "?"} | lines=${offerLines.length}${
        tracking ? ` | tracking=${tracking}` : ""
      }`,
    );

    for (const line of offerLines) {
      const input: SyncOfferLineInput = {
        offerId: line.offerId,
        offerFilter: line.offerFilter,
        status: head.status,
        dealer: head.dealer ?? "",
        createdAt: head.createdAtDn ?? "",
        title: line.title,
        upc: line.upc,
        qty: line.qty,
        unitPrice: line.unitPrice ? Number(line.unitPrice) : null,
        perBoxUnitPrice: line.perBoxUnitPrice ? Number(line.perBoxUnitPrice) : null,
        unitOfMeasure: line.unitOfMeasure,
        caseQtyBoxes: line.caseQtyBoxes,
        trackingNumber: line.trackingNumber,
      };

      if (skipShopify) {
        console.log(`  - upc=${line.upc ?? "-"} qty=${line.qty} ${line.title.slice(0, 60)}`);
        continue;
      }

      const m = matchOfferLineToVariant({ title: line.title, upc: line.upc }, index, overrides);
      if (m.variantId) mapped += 1;
      else missing += 1;
      console.log(
        `  - upc=${line.upc ?? "-"} | match=${m.method}${m.variantId ? ` → variant ${m.variantId}` : " (MISSING)"} | ${line.title.slice(0, 50)}`,
      );
    }
    console.log("");
  }

  if (!skipShopify) {
    console.log(`Summary: ${mapped} lines mapped, ${missing} missing product, ${withTracking} offers with tracking`);
    console.log("Next: npm run job:sync-offers:purchase  (dry-run) then -- purchase --execute");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
