// apps/worker/src/jobs/export-catalog.ts
//
// P0 job — export the shared sealed-product catalog.
//   1. Pull sealed-wax variants from Shopify (read-only bulk operation)
//   2. Write a CSV snapshot      -> consumed by shoelessjoes-supplier-py
//   3. Upsert ProductCatalog     -> consumed by shoelessjoes-ops sync-offers
//
// Run: npm run job:export-catalog
//
// Safe to run repeatedly. Read-only against Shopify; only writes to the
// local Postgres ProductCatalog table and the CSV snapshot path.

import { exportSealedCatalog } from "@dealernet-ops/core";
// ^^ ADJUST this import to your monorepo's alias for packages/core
//    (e.g. "@shoelessjoes/core/shopify/catalog-export" or a relative path).

import { prisma } from "@dealernet-ops/db";
// ^^ ADJUST this import to however packages/db exports the Prisma client.

async function main() {
  const csvPath =
    process.env.CATALOG_CSV_PATH ?? "data/sealed-catalog.csv";
  console.log(`[export-catalog] Shopify bulk export -> ${csvPath}`);

  const rows = await exportSealedCatalog({ csvPath });
  console.log(
    `[export-catalog] fetched ${rows.length} variant(s); CSV snapshot written`,
  );

  let upserts = 0;
  for (const r of rows) {
    await prisma.productCatalog.upsert({
      where: { variantId: r.variantId },
      create: {
        variantId: r.variantId,
        productId: r.productId,
        barcode: r.barcode,
        productTitle: r.productTitle,
        variantTitle: r.variantTitle,
        sku: r.sku,
        productType: r.productType,
        vendor: r.vendor,
        tags: r.tags,
        price: r.price,
        unitCost: r.unitCost,
        inventoryQuantity: r.inventoryQuantity,
        status: r.status,
      },
      update: {
        productId: r.productId,
        barcode: r.barcode,
        productTitle: r.productTitle,
        variantTitle: r.variantTitle,
        sku: r.sku,
        productType: r.productType,
        vendor: r.vendor,
        tags: r.tags,
        price: r.price,
        unitCost: r.unitCost,
        inventoryQuantity: r.inventoryQuantity,
        status: r.status,
        syncedAt: new Date(),
      },
    });
    upserts++;
  }

  console.log(
    `[export-catalog] upserted ${upserts} row(s) into ProductCatalog`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[export-catalog] failed:", err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
