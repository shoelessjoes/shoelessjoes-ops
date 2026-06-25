import {
  matchOfferLineToVariant,
  syncAcceptedOffersToShopify,
  syncAcceptedPurchasesToShopify,
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

function offerFilterForMode(mode: SyncMode): string {
  return mode === "purchase" ? "PURCHASESUNRATED" : "SALESUNRATED";
}

async function syncPurchases(
  shop: { id: string; shopifyDomain: string; accessToken: string },
  runId: string,
  dryRun: boolean,
  createMissing: boolean,
) {
  const apiVersion = optionalEnv("SHOPIFY_API_VERSION") ?? "2024-10";
  const accessToken = (shop.accessToken && shop.accessToken.trim()) || requireEnv("SHOPIFY_ACCESS_TOKEN");
  const session = { shopDomain: shop.shopifyDomain, accessToken, apiVersion };

  const overridesRows = await prisma.productMappingOverride.findMany({ where: { shopId: shop.id } });
  const overrides = new Map<string, string>();
  for (const o of overridesRows) {
    if (o.upc) overrides.set(`upc:${o.upc}`, o.variantId);
    overrides.set(`title:${o.dealernetTitleNorm}`, o.variantId);
  }

  const dbLines = await prisma.dealernetOfferLine.findMany({
    where: {
      shopId: shop.id,
      offerFilter: "PURCHASESUNRATED",
      dealernetOffer: { status: { equals: "ACCEPTED", mode: "insensitive" } },
    },
    include: { dealernetOffer: true },
  });

  const linkedKeys = new Set(
    (
      await prisma.inboundLine.findMany({
        where: {
          shopId: shop.id,
          source: "dealernet",
          direction: "inbound",
          shopifyVariantId: { not: null },
          stage: { notIn: ["cancelled", "received"] },
        },
        select: { canonicalKey: true },
      })
    ).map((l) => l.canonicalKey),
  );

  const purchaseInputs = dbLines.map((l) => ({
    offerId: l.offerId,
    offerFilter: l.offerFilter,
    title: l.title,
    upc: l.upc,
    qty: l.qty,
    unitPrice: l.unitPrice ? Number(l.unitPrice) : null,
    perBoxUnitPrice: l.perBoxUnitPrice ? Number(l.perBoxUnitPrice) : null,
    unitOfMeasure: l.unitOfMeasure ?? null,
    caseQtyBoxes: l.caseQtyBoxes ?? null,
  }));

  const result = await syncAcceptedPurchasesToShopify({
    session,
    lines: purchaseInputs,
    dryRun,
    createMissingProducts: createMissing,
    skipCanonicalKeys: linkedKeys,
    matchVariant: (line, idx) => {
      const m = matchOfferLineToVariant({ title: line.title, upc: line.upc }, idx, overrides);
      return { variantId: m.variantId };
    },
  });

  for (const lr of result.lineResults) {
    if (lr.shopifyVariantId && (lr.status === "linked" || lr.status === "dry_run")) {
      await prisma.inboundLine.updateMany({
        where: { canonicalKey: lr.canonicalKey },
        data: { shopifyVariantId: lr.shopifyVariantId },
      });
    }

    const existing = await prisma.shopifySyncEvent.findUnique({ where: { idempotencyKey: lr.idempotencyKey } });
    if (existing) continue;
    await prisma.shopifySyncEvent.create({
      data: {
        syncRunId: runId,
        offerId: lr.offerId,
        mode: "purchase",
        idempotencyKey: lr.idempotencyKey,
        status: lr.status,
        error: lr.error,
      },
    });
  }

  const output = {
    summary: {
      mode: "purchase",
      offerFilter: "PURCHASESUNRATED",
      label: "purchases → InboundLine variant link + unit cost (no draft orders)",
      dryRun,
      createMissingProducts: createMissing,
      acceptedInDb: { lines: dbLines.length },
      alreadyLinked: linkedKeys.size,
      linesLinked: result.linesLinked,
      linesSkippedMissingProduct: result.linesSkippedMissingProduct,
      linesSkippedUncertainCaseQty: result.linesSkippedUncertainCaseQty,
      productsCreated: result.productsCreated,
      costsUpdated: result.costsUpdated,
    },
    result,
  };

  const s = output.summary;
  console.log(
    `\n=== sync-offers purchase (${s.dryRun ? "DRY-RUN" : "EXECUTE"}) ===\n` +
      `${s.label}\n` +
      `DB accepted: ${s.acceptedInDb.lines} lines; already linked: ${s.alreadyLinked}\n` +
      `This run: ${s.linesLinked} linked, ${s.linesSkippedMissingProduct} missing product, ` +
      `${s.linesSkippedUncertainCaseQty} uncertain case qty, ${s.costsUpdated} costs updated\n`,
  );
  console.log(JSON.stringify(output, null, 2));

  await prisma.shopifySyncRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      finishedAt: new Date(),
      statsJson: output as unknown as object,
    },
  });
}

async function syncSales(
  shop: { id: string; shopifyDomain: string; accessToken: string },
  runId: string,
  dryRun: boolean,
  createMissing: boolean,
) {
  const offerFilter = "SALESUNRATED";
  const apiVersion = optionalEnv("SHOPIFY_API_VERSION") ?? "2024-10";
  const accessToken = (shop.accessToken && shop.accessToken.trim()) || requireEnv("SHOPIFY_ACCESS_TOKEN");

  const overridesRows = await prisma.productMappingOverride.findMany({ where: { shopId: shop.id } });
  const overrides = new Map<string, string>();
  for (const o of overridesRows) {
    if (o.upc) overrides.set(`upc:${o.upc}`, o.variantId);
    overrides.set(`title:${o.dealernetTitleNorm}`, o.variantId);
  }

  const dbLines = await prisma.dealernetOfferLine.findMany({
    where: {
      shopId: shop.id,
      offerFilter,
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
            where: { mode: "sale", status: "created", syncRunId: { in: runIds } },
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
    mode: "sale",
    dryRun,
    createMissingProducts: createMissing,
    acceptedOnly: true,
    matchVariant: (line, idx) => {
      const m = matchOfferLineToVariant({ title: line.title, upc: line.upc }, idx, overrides);
      return { variantId: m.variantId };
    },
  });

  const dbOfferIds = new Set(dbLines.map((l) => l.offerId));
  const pendingOfferIds = new Set(inputs.map((l) => l.offerId));
  const alreadySyncedOfferIds = [...dbOfferIds].filter((id) => alreadySynced.has(id));
  const outcomeByStatus: Record<string, number> = {};
  for (const ev of result.events) {
    outcomeByStatus[ev.status] = (outcomeByStatus[ev.status] ?? 0) + 1;
  }

  const output = {
    summary: {
      mode: "sale",
      offerFilter,
      label: "sales (For Sale / sell-side) → Shopify draft orders",
      dryRun,
      createMissingProducts: createMissing,
      acceptedInDb: {
        offers: dbOfferIds.size,
        lines: dbLines.length,
      },
      alreadySyncedOffers: alreadySyncedOfferIds.length,
      pendingSync: {
        offers: pendingOfferIds.size,
        lines: inputs.length,
      },
      outcomeByStatus,
      linesMapped: result.linesMapped,
      linesSkippedMissingProduct: result.linesSkippedMissingProduct,
      linesSkippedUncertainCaseQty: result.linesSkippedUncertainCaseQty,
    },
    result,
  };

  for (const ev of result.events) {
    const existing = await prisma.shopifySyncEvent.findUnique({ where: { idempotencyKey: ev.idempotencyKey } });
    if (existing) continue;
    await prisma.shopifySyncEvent.create({
      data: {
        syncRunId: runId,
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
    where: { id: runId },
    data: {
      status: "completed",
      finishedAt: new Date(),
      statsJson: output as unknown as object,
    },
  });

  const s = output.summary;
  console.log(
    `\n=== sync-offers sale (${s.dryRun ? "DRY-RUN" : "EXECUTE"}) ===\n` +
      `${s.label}\n` +
      `DB accepted: ${s.acceptedInDb.offers} offers, ${s.acceptedInDb.lines} lines\n` +
      `Already synced (skipped): ${s.alreadySyncedOffers} offers\n` +
      `This run: ${s.pendingSync.offers} offers, ${s.pendingSync.lines} lines → ` +
      `${s.linesMapped} lines mapped, ${s.linesSkippedMissingProduct} missing product, ` +
      `${s.linesSkippedUncertainCaseQty} uncertain case qty\n` +
      `Offer outcomes: ${JSON.stringify(s.outcomeByStatus)}\n`,
  );
  console.log(JSON.stringify(output, null, 2));
}

async function main() {
  const { mode, dryRun, createMissing } = parseArgs();
  const shop = await getOrCreateShopFromEnv();

  const run = await prisma.shopifySyncRun.create({
    data: {
      shopId: shop.id,
      mode,
      dryRun,
      status: "running",
    },
  });

  try {
    if (mode === "purchase") {
      await syncPurchases(shop, run.id, dryRun, createMissing);
    } else {
      await syncSales(shop, run.id, dryRun, createMissing);
    }
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
