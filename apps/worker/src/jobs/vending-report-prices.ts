import { prisma } from "@dealernet-ops/db";
import { getOrCreateShopFromEnv } from "../shop.js";

function fmt(n: unknown): string {
  if (n == null) return "—";
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : String(n);
}

async function main() {
  const shop = await getOrCreateShopFromEnv();
  const onlyDiff = process.argv.includes("--diff-only");

  const rows = await prisma.vendingProductMirror.findMany({
    where: { shopId: shop.id },
    orderBy: { productTitle: "asc" },
  });

  if (!rows.length) {
    console.warn("[vending-report-prices] No mirror rows. Run export-catalog → sync-shopify-mirror → fetch-zhongda → reconcile.");
    return;
  }

  const linked = rows.filter((r) => r.zhongdaGoodsId != null);
  const diffs = linked.filter((r) => {
    const s = r.shopifyPrice != null ? Number(r.shopifyPrice) : null;
    const z = r.zhongdaPrice != null ? Number(r.zhongdaPrice) : null;
    if (s == null || z == null) return false;
    return Math.abs(s - z) >= 0.01;
  });

  console.log(`\n[vending-report-prices] shop=${shop.shopifyDomain}`);
  console.log(`  mirror rows: ${rows.length}`);
  console.log(`  linked to Zhongda: ${linked.length}`);
  console.log(`  price mismatch (shopify vs zhongda): ${diffs.length}\n`);

  const show = onlyDiff ? diffs : linked.length ? linked : rows;
  console.log(
    "shopify_title".padEnd(42) +
      "shopify$".padStart(10) +
      "zhongda$".padStart(10) +
      "qty".padStart(6) +
      "  status",
  );
  console.log("-".repeat(80));

  for (const r of show) {
    const title = (r.variantTitle && r.variantTitle !== "Default Title"
      ? `${r.productTitle} - ${r.variantTitle}`
      : r.productTitle
    ).slice(0, 40);
    console.log(
      title.padEnd(42) +
        fmt(r.shopifyPrice).padStart(10) +
        fmt(r.zhongdaPrice).padStart(10) +
        String(r.shopifyQty ?? "—").padStart(6) +
        `  ${r.syncStatus}`,
    );
  }

  if (diffs.length) {
    console.log(`\n${diffs.length} row(s) where Shopify price ≠ Zhongda sell_price.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
