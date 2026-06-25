import {
  dealernetLineCanonicalKey,
  dealernetOfferFilterDirection,
  inboundStageFromTracking,
  mergeInboundStage,
} from "@dealernet-ops/core";
import { prisma } from "@dealernet-ops/db";

export type SyncDealernetInboundResult = {
  upserted: number;
  cancelled: number;
};

export async function syncDealernetInboundLines(shopId: string): Promise<SyncDealernetInboundResult> {
  const offers = await prisma.dealernetOffer.findMany({
    where: {
      status: { equals: "ACCEPTED", mode: "insensitive" },
      offerFilter: { in: ["PURCHASESUNRATED", "SALESUNRATED"] },
    },
    include: { lines: true },
  });

  const activeKeys = new Set<string>();
  let upserted = 0;

  for (const offer of offers) {
    const direction = dealernetOfferFilterDirection(offer.offerFilter);
    if (!direction) continue;

    for (const line of offer.lines) {
      const canonicalKey = dealernetLineCanonicalKey({
        offerId: line.offerId,
        offerFilter: line.offerFilter,
        upc: line.upc,
        title: line.title,
        qty: line.qty,
      });
      activeKeys.add(canonicalKey);

      const nextStage = inboundStageFromTracking(line.trackingNumber);
      const existing = await prisma.inboundLine.findUnique({ where: { canonicalKey } });
      const stage = existing
        ? mergeInboundStage(existing.stage, existing.qtyReceived, existing.qtyOrdered, nextStage)
        : nextStage;

      await prisma.inboundLine.upsert({
        where: { canonicalKey },
        create: {
          shopId,
          canonicalKey,
          source: "dealernet",
          direction,
          externalId: line.offerId,
          documentType: "offer",
          stage,
          title: line.title,
          upc: line.upc,
          qtyOrdered: line.qty,
          qtyReceived: 0,
          unitCost: line.unitPrice,
          unitOfMeasure: line.unitOfMeasure,
          caseQtyBoxes: line.caseQtyBoxes,
          tracking: line.trackingNumber,
          dealer: offer.dealer,
          offerFilter: line.offerFilter,
          dealernetOfferId: offer.id,
          listingUrl: line.listingUrl,
          rawUrl: offer.offerDetailUrl,
        },
        update: {
          direction,
          externalId: line.offerId,
          stage,
          title: line.title,
          upc: line.upc,
          qtyOrdered: line.qty,
          unitCost: line.unitPrice,
          unitOfMeasure: line.unitOfMeasure,
          caseQtyBoxes: line.caseQtyBoxes,
          tracking: line.trackingNumber || undefined,
          dealer: offer.dealer,
          offerFilter: line.offerFilter,
          dealernetOfferId: offer.id,
          listingUrl: line.listingUrl,
          rawUrl: offer.offerDetailUrl,
        },
      });
      upserted++;
    }
  }

  const cancelled = await prisma.inboundLine.updateMany({
    where: {
      shopId,
      source: "dealernet",
      canonicalKey: { notIn: [...activeKeys] },
      stage: { notIn: ["received", "cancelled"] },
    },
    data: { stage: "cancelled" },
  });

  return { upserted, cancelled: cancelled.count };
}
