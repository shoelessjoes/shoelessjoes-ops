/**
 * Build UPC tier CSVs + shopify_variants.csv for shoelessjoes-supplier-py
 * from ProductCatalog (run job:export-catalog first).
 */
import { writeFile, mkdir } from "node:fs/promises";
import { prisma } from "@dealernet-ops/db";

function upcCsv(upcs: string[]): string {
  return "upc\n" + upcs.join("\n") + (upcs.length ? "\n" : "");
}

function esc(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const rows = await prisma.productCatalog.findMany();
  if (!rows.length) {
    console.warn("[export-upc-tiers] ProductCatalog empty — run npm run job:export-catalog first.");
    process.exit(1);
  }

  const inStock: string[] = [];
  const outOfStock: string[] = [];
  const allBarcodes: string[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const upc = (r.barcode ?? "").trim();
    if (!upc || seen.has(upc)) continue;
    seen.add(upc);
    allBarcodes.push(upc);
    const qty = r.inventoryQuantity ?? 0;
    if (qty > 0) inStock.push(upc);
    else outOfStock.push(upc);
  }

  await mkdir("data", { recursive: true });
  await writeFile("data/upcs_in_stock.csv", upcCsv(inStock), "utf8");
  await writeFile("data/upcs_out_of_stock.csv", upcCsv(outOfStock), "utf8");
  await writeFile("data/upcs_all_barcodes.csv", upcCsv(allBarcodes), "utf8");

  const headers = [
    "product_id",
    "variant_id",
    "product_title",
    "product_created_at",
    "product_status",
    "product_type",
    "variant_title",
    "sku",
    "barcode",
    "price",
    "compare_at_price",
    "cost",
    "inventory_quantity",
    "sold_7d",
    "sold_30d",
    "sold_60d",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.productId,
        r.variantId,
        r.productTitle,
        "",
        r.status ?? "",
        r.productType ?? "",
        r.variantTitle ?? "",
        r.sku ?? "",
        r.barcode ?? "",
        r.price ?? "",
        "",
        r.unitCost ?? "",
        r.inventoryQuantity ?? "",
        "0",
        "0",
        "0",
      ]
        .map(esc)
        .join(","),
    );
  }
  await writeFile("data/shopify_variants_for_pricing.csv", lines.join("\n") + "\n", "utf8");

  console.log(`[export-upc-tiers] in_stock=${inStock.length} oos=${outOfStock.length} all=${allBarcodes.length}`);
  console.log("[export-upc-tiers] wrote data/upcs_*.csv and data/shopify_variants_for_pricing.csv");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
