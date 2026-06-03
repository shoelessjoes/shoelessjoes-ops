/**
 * Copy ProductCatalog (or all Shopify catalog rows) into VendingProductMirror
 * so vending price/inventory jobs have a stable join table.
 *
 * Run after: npm run job:export-catalog
 * Does not call Zhongda — Shopify-side mirror only.
 */
import { prisma } from "@dealernet-ops/db";
import { getOrCreateShopFromEnv } from "../shop.js";

async function main() {
  const shop = await getOrCreateShopFromEnv();
  const rows = await prisma.productCatalog.findMany({
    orderBy: { productTitle: "asc" },
  });

  if (rows.length === 0) {
    console.warn(
      "[vending-sync-shopify-mirror] ProductCatalog is empty. Run npm run job:export-catalog first.",
    );
    return;
  }

  let upserts = 0;
  for (const r of rows) {
    await prisma.vendingProductMirror.upsert({
      where: {
        shopId_variantId: { shopId: shop.id, variantId: r.variantId },
      },
      create: {
        shopId: shop.id,
        variantId: r.variantId,
        barcode: r.barcode,
        sku: r.sku,
        productTitle: r.productTitle,
        variantTitle: r.variantTitle,
        shopifyPrice: r.price,
        shopifyQty: r.inventoryQuantity,
        syncStatus: "shopify_only",
        syncedAt: new Date(),
      },
      update: {
        barcode: r.barcode,
        sku: r.sku,
        productTitle: r.productTitle,
        variantTitle: r.variantTitle,
        shopifyPrice: r.price,
        shopifyQty: r.inventoryQuantity,
        syncedAt: new Date(),
      },
    });
    upserts++;
  }

  console.log(`[vending-sync-shopify-mirror] upserted ${upserts} mirror row(s) for shop ${shop.shopifyDomain}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
