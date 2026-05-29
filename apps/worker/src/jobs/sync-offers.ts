import {
  matchOfferLineToVariant,
  syncAcceptedOffersToShopify,
  type SyncMode,
  type SyncOfferLineInput,
} from "@dealernet-ops/core";
import { prisma } from "@dealernet-ops/db";
import { requireEnv, optionalEnv } from "../env.js";
import { getOrCreateShopFromEnv } from "../shop.js";

function parseArgs() {
  const mode = (process.argv[2] as SyncMode) || "purchase";
  const explicitExecute = process.argv.includes("--execute");
  const explicitDryRun = process.argv.includes("--dry-run");
  const envAutoExecute = process.env.SYNC_AUTO_EXECUTE === "1";
  const dryRun = explicitDryRun || (!explicitExecute && !envAutoExecute);
  const createMissing =
    process.argv.includes("--create-missing") ||
    (!process.argv.includes("--no-create-missing") && mode === "purchase");
  if (mode !== "purchase" && mode !== "sale") {
    throw new Error(
      "Usage: tsx sync-offers.ts <purchase|sale> [--execute|--dry-run] [--create-missing|--no-create-missing]",
    );
  }
  return { mode, dryRun, createMissing };
}

async function main() {
  const { mode, dryRun, createMissing } = parseArgs();
  const shop = await getOrCreateShopFromEnv();
  const apiVersion = optionalEnv("SHOPIFY_API_VERSION") ?? "2024-10";
  const accessToken = (shop.accessToken && shop.accessToken.trim()) || requireEnv("SHOPIFY_ACCESS_TOKEN");

  const run = await prisma.shopifySyncRun.create({
    data: {
      shopId: shop.id,
      mode,
      dryRun,
      status: "running",
    },
  });

  try {
    const overridesRows = await prisma.productMappingOverride.findMany({ where: { shopId: shop.id } });
    const overrides = new Map<string, string>();
    for (const o of overridesRows) {
      if (o.upc) overrides.set(`upc:${o.upc}`, o.variantId);
      overrides.set(`title:${o.dealernetTitleNorm}`, o.variantId);
    }

    const dbLines = await prisma.dealernetOfferLine.findMany({
      where: {
        shopId: shop.id,
        dealernetOffer: { status: { equals: "ACCEPTED", mode: "insensitive" } },
      },
      include: { dealernetOffer: true },
    });

    const runIds = (
      await prisma.shopifySyncRun.findMany({
        where: { shopId: shop.id },
        select: { id: true },
      })
    ).map((r) => r.id);

    const alreadySynced = new Set(
      runIds.length
        ? (
            await prisma.shopifySyncEvent.findMany({
              where: { mode, status: "created", syncRunId: { in: runIds } },
              select: { offerId: true },
            })
          ).map((e) => e.offerId)
        : [],
    );

    const inputs: SyncOfferLineInput[] = dbLines
      .filter((l) => !alreadySynced.has(l.offerId))
      .map((l) => ({
        offerId: l.offerId,
        offerFilter: l.offerFilter,
        status: l.dealernetOffer.status,
        dealer: l.dealernetOffer.dealer ?? "",
        createdAt: l.dealernetOffer.createdAtDn ?? "",
        title: l.title,
        upc: l.upc,
        qty: l.qty,
        unitPrice: l.unitPrice ? Number(l.unitPrice) : null,
        perBoxUnitPrice: l.perBoxUnitPrice ? Number(l.perBoxUnitPrice) : null,
        unitOfMeasure: l.unitOfMeasure ?? null,
        caseQtyBoxes: l.caseQtyBoxes ?? null,
        trackingNumber: l.trackingNumber,
      }));

    const session = {
      shopDomain: shop.shopifyDomain,
      accessToken,
      apiVersion,
    };

    const result = await syncAcceptedOffersToShopify({
      session,
      lines: inputs,
      mode,
      dryRun,
      createMissingProducts: createMissing,
      acceptedOnly: true,
      matchVariant: (line, idx) => {
        const m = matchOfferLineToVariant({ title: line.title, upc: line.upc }, idx, overrides);
        return { variantId: m.variantId };
      },
    });

    for (const ev of result.events) {
      const existing = await prisma.shopifySyncEvent.findUnique({ where: { idempotencyKey: ev.idempotencyKey } });
      if (existing) continue;
      await prisma.shopifySyncEvent.create({
        data: {
          syncRunId: run.id,
          offerId: ev.offerId,
          mode: ev.mode,
          idempotencyKey: ev.idempotencyKey,
          status: ev.status,
          shopifyDraftOrderId: ev.shopifyDraftOrderId,
          shopifyOrderId: ev.shopifyOrderId,
          error: ev.error,
        },
      });
    }

    await prisma.shopifySyncRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        statsJson: result as unknown as object,
      },
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    await prisma.shopifySyncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: e instanceof Error ? e.message : String(e),
      },
    });
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
