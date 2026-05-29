import { collectDealernetOffers } from "@dealernet-ops/core";
import { prisma } from "@dealernet-ops/db";
import { loadDealernetLogin } from "../dealernet-login.js";
import { getOrCreateShopFromEnv } from "../shop.js";

async function main() {
  const shop = await getOrCreateShopFromEnv();
  const login = loadDealernetLogin();

  for (const filter of ["PURCHASESUNRATED", "SALESUNRATED"] as const) {
    const rows = await collectDealernetOffers({ login, offerFilter: filter });

    const byOffer = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = `${r.offer_id}::${r.offerfilter}`;
      const list = byOffer.get(key) ?? [];
      list.push(r);
      byOffer.set(key, list);
    }

    for (const [, group] of byOffer) {
      const head = group[0];
      const offer = await prisma.dealernetOffer.upsert({
        where: {
          offerId_offerFilter: { offerId: head.offer_id, offerFilter: head.offerfilter },
        },
        create: {
          offerId: head.offer_id,
          offerFilter: head.offerfilter,
          dealer: head.dealer || null,
          status: head.status,
          createdAtDn: head.created_at || null,
          offerTotal: head.offer_total ? head.offer_total : null,
          offerDetailUrl: head.offer_detail_url || null,
        },
        update: {
          dealer: head.dealer || null,
          status: head.status,
          createdAtDn: head.created_at || null,
          offerTotal: head.offer_total ? head.offer_total : null,
          offerDetailUrl: head.offer_detail_url || null,
        },
      });

      await prisma.dealernetOfferLine.deleteMany({
        where: { dealernetOfferId: offer.id },
      });

      for (const r of group) {
        const caseQtyBoxes = r.case_qty_boxes ? Number.parseInt(r.case_qty_boxes, 10) : null;
        await prisma.dealernetOfferLine.create({
          data: {
            dealernetOfferId: offer.id,
            offerId: r.offer_id,
            offerFilter: r.offerfilter,
            title: r.title,
            upc: r.upc || null,
            qty: Number.parseInt(r.qty, 10) || 0,
            unitPrice: r.unit_price ? r.unit_price : null,
            subtotal: r.subtotal ? r.subtotal : null,
            perBoxUnitPrice: r.per_box_unit_price ? r.per_box_unit_price : null,
            unitOfMeasure: r.unit_of_measure || null,
            caseQtyBoxes: Number.isFinite(caseQtyBoxes ?? Number.NaN) ? caseQtyBoxes : null,
            trackingNumber: r.tracking_number || null,
            listingUrl: r.listing_url || null,
            shopId: shop.id,
          },
        });
      }
    }

    console.log(`Ingested ${rows.length} raw lines across ${byOffer.size} offers (${filter})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
