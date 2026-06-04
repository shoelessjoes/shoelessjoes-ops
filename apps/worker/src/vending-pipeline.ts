import {
  exportSealedCatalog,
  fetchAllZhongdaGoods,
  matchShopifyToZhongdaGoods,
  parseZhongdaMoney,
  sendSmtpAlert,
  type AlertSmtpConfig,
} from "@dealernet-ops/core";
import { prisma } from "@dealernet-ops/db";
import type { Shop } from "@prisma/client";
import { loadZhongdaApiConfig } from "./zhongda-api-config.js";
import { optionalEnv } from "./env.js";

export type VendingPriceDiff = {
  productTitle: string;
  variantTitle: string | null;
  shopifyPrice: number;
  zhongdaPrice: number;
  shopifyQty: number | null;
  zhongdaGoodsId: number;
  syncStatus: string;
  delta: number;
};

export type VendingPriceCheckResult = {
  catalogRows: number;
  mirrorRows: number;
  zhongdaRows: number;
  linked: number;
  unmatched: number;
  diffs: VendingPriceDiff[];
};

function loadSmtpOptional(): AlertSmtpConfig | null {
  const host = optionalEnv("ALERT_SMTP_HOST");
  const from = optionalEnv("ALERT_FROM_EMAIL");
  const to = (optionalEnv("ALERT_TO_EMAILS") ?? "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!host || !from || !to.length) return null;
  return {
    host,
    port: Number(optionalEnv("ALERT_SMTP_PORT") ?? "587"),
    username: optionalEnv("ALERT_SMTP_USERNAME") ?? "",
    password: optionalEnv("ALERT_SMTP_PASSWORD") ?? "",
    startTls: (optionalEnv("ALERT_SMTP_STARTTLS") ?? "true").toLowerCase() !== "false",
    fromEmail: from,
    toEmails: to,
    smsEmails: (optionalEnv("ALERT_SMS_EMAILS") ?? "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export async function runExportCatalogToDb(): Promise<number> {
  const csvPath = optionalEnv("CATALOG_CSV_PATH") ?? "data/sealed-catalog.csv";
  const rows = await exportSealedCatalog({ csvPath });
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
  }
  return rows.length;
}

export async function runSyncShopifyMirror(shop: Shop): Promise<number> {
  const rows = await prisma.productCatalog.findMany({ orderBy: { productTitle: "asc" } });
  for (const r of rows) {
    await prisma.vendingProductMirror.upsert({
      where: { shopId_variantId: { shopId: shop.id, variantId: r.variantId } },
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
  }
  return rows.length;
}

export async function runFetchZhongdaGoods(shop: Shop): Promise<number> {
  const cfg = loadZhongdaApiConfig();
  const rows = await fetchAllZhongdaGoods(cfg);
  for (const g of rows) {
    await prisma.zhongdaGoods.upsert({
      where: { shopId_zhongdaId: { shopId: shop.id, zhongdaId: g.id } },
      create: {
        shopId: shop.id,
        zhongdaId: g.id,
        goodsNo: g.goods_no || null,
        goodsName: g.goods_name,
        costPrice: parseZhongdaMoney(g.cost_price),
        sellPrice: parseZhongdaMoney(g.sell_price),
        marketPrice: parseZhongdaMoney(g.market_price),
        categoryName: g.category_name,
        brandName: g.brand_name,
        unitName: g.goods_unit_name,
        imageUrl: g.http_image_url ?? g.image_url,
      },
      update: {
        goodsNo: g.goods_no || null,
        goodsName: g.goods_name,
        costPrice: parseZhongdaMoney(g.cost_price),
        sellPrice: parseZhongdaMoney(g.sell_price),
        marketPrice: parseZhongdaMoney(g.market_price),
        categoryName: g.category_name,
        brandName: g.brand_name,
        unitName: g.goods_unit_name,
        imageUrl: g.http_image_url ?? g.image_url,
        syncedAt: new Date(),
      },
    });
  }
  return rows.length;
}

export async function runReconcileVending(shop: Shop): Promise<{ linked: number; unmatched: number }> {
  const zhongdaRows = await prisma.zhongdaGoods.findMany({ where: { shopId: shop.id } });
  const goodsApiShape = zhongdaRows.map((z) => ({
    id: z.zhongdaId,
    goods_name: z.goodsName,
    goods_no: z.goodsNo ?? "",
    cost_price: z.costPrice?.toString() ?? null,
    sell_price: z.sellPrice?.toString() ?? null,
    market_price: z.marketPrice?.toString() ?? null,
    category_name: z.categoryName,
    goods_unit_name: z.unitName,
    brand_name: z.brandName,
    goods_from: null,
    image_url: z.imageUrl,
    http_image_url: z.imageUrl,
  }));

  const mirrors = await prisma.vendingProductMirror.findMany({ where: { shopId: shop.id } });
  let linked = 0;
  let unmatched = 0;

  for (const m of mirrors) {
    const match = matchShopifyToZhongdaGoods(m.productTitle, m.variantTitle, goodsApiShape);
    if (!match) {
      unmatched++;
      await prisma.vendingProductMirror.update({
        where: { id: m.id },
        data: { syncStatus: "no_zhongda_match", lastError: null },
      });
      continue;
    }
    linked++;
    await prisma.vendingProductMirror.update({
      where: { id: m.id },
      data: {
        zhongdaGoodsId: match.goods.id,
        zhongdaSku: match.goods.goods_no || null,
        zhongdaGoodsName: match.goods.goods_name,
        zhongdaPrice: parseZhongdaMoney(match.goods.sell_price),
        zhongdaCost: parseZhongdaMoney(match.goods.cost_price),
        syncStatus: match.matchType === "exact_title" ? "linked" : "linked_fuzzy",
        lastError: match.matchType === "fuzzy_title" ? `fuzzy score ${match.score}` : null,
        syncedAt: new Date(),
      },
    });
  }

  return { linked, unmatched };
}

export function collectPriceDiffs(
  mirrors: Array<{
    productTitle: string;
    variantTitle: string | null;
    shopifyPrice: unknown;
    zhongdaPrice: unknown;
    shopifyQty: number | null;
    zhongdaGoodsId: number | null;
    syncStatus: string;
  }>,
  opts?: { inStockOnly?: boolean; minDelta?: number },
): VendingPriceDiff[] {
  const minDelta = opts?.minDelta ?? 0.01;
  const inStockOnly = opts?.inStockOnly ?? false;
  const diffs: VendingPriceDiff[] = [];

  for (const r of mirrors) {
    if (r.zhongdaGoodsId == null) continue;
    if (inStockOnly && (r.shopifyQty ?? 0) <= 0) continue;

    const s = r.shopifyPrice != null ? Number(r.shopifyPrice) : null;
    const z = r.zhongdaPrice != null ? Number(r.zhongdaPrice) : null;
    if (s == null || z == null) continue;
    if (Math.abs(s - z) < minDelta) continue;

    diffs.push({
      productTitle: r.productTitle,
      variantTitle: r.variantTitle,
      shopifyPrice: s,
      zhongdaPrice: z,
      shopifyQty: r.shopifyQty,
      zhongdaGoodsId: r.zhongdaGoodsId,
      syncStatus: r.syncStatus,
      delta: Math.round((s - z) * 100) / 100,
    });
  }

  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return diffs;
}

export async function runVendingPriceCheck(shop: Shop): Promise<VendingPriceCheckResult> {
  console.log("[vending-price-check] 1/5 export Shopify catalog…");
  const catalogRows = await runExportCatalogToDb();
  console.log(`[vending-price-check]   ${catalogRows} catalog variant(s)`);

  console.log("[vending-price-check] 2/5 sync Shopify → VendingProductMirror…");
  const mirrorRows = await runSyncShopifyMirror(shop);
  console.log(`[vending-price-check]   ${mirrorRows} mirror row(s)`);

  console.log("[vending-price-check] 3/5 fetch Zhongda goods (REST)…");
  const zhongdaRows = await runFetchZhongdaGoods(shop);
  console.log(`[vending-price-check]   ${zhongdaRows} Zhongda goods`);

  console.log("[vending-price-check] 4/5 reconcile titles…");
  const { linked, unmatched } = await runReconcileVending(shop);
  console.log(`[vending-price-check]   ${linked} linked, ${unmatched} unmatched`);

  const inStockOnly = optionalEnv("VENDING_REPORT_IN_STOCK_ONLY") === "1";
  const mirrors = await prisma.vendingProductMirror.findMany({
    where: { shopId: shop.id },
    orderBy: { productTitle: "asc" },
  });
  const diffs = collectPriceDiffs(mirrors, { inStockOnly });

  return { catalogRows, mirrorRows, zhongdaRows, linked, unmatched, diffs };
}

export function formatPriceCheckReport(result: VendingPriceCheckResult): string {
  const lines: string[] = [];
  lines.push(`Catalog variants: ${result.catalogRows}`);
  lines.push(`Mirror rows: ${result.mirrorRows}`);
  lines.push(`Zhongda goods: ${result.zhongdaRows}`);
  lines.push(`Linked: ${result.linked}, unmatched: ${result.unmatched}`);
  lines.push(`Price mismatches (Shopify vs Zhongda sell): ${result.diffs.length}`);
  lines.push("");

  for (const d of result.diffs.slice(0, 50)) {
    const title =
      d.variantTitle && d.variantTitle !== "Default Title"
        ? `${d.productTitle} - ${d.variantTitle}`
        : d.productTitle;
    const qty = d.shopifyQty != null ? ` qty=${d.shopifyQty}` : "";
    lines.push(
      `- ${title}${qty}\n  Shopify $${d.shopifyPrice.toFixed(2)} | Zhongda $${d.zhongdaPrice.toFixed(2)} | Δ $${d.delta.toFixed(2)} | id ${d.zhongdaGoodsId}`,
    );
  }
  if (result.diffs.length > 50) {
    lines.push(`… and ${result.diffs.length - 50} more`);
  }
  return lines.join("\n");
}

export async function maybeEmailPriceCheckReport(
  result: VendingPriceCheckResult,
): Promise<void> {
  if (optionalEnv("VENDING_PRICE_CHECK_EMAIL") !== "1") return;
  if (!result.diffs.length) return;

  const smtp = loadSmtpOptional();
  if (!smtp) {
    console.warn("[vending-price-check] VENDING_PRICE_CHECK_EMAIL=1 but SMTP not configured");
    return;
  }

  const text = formatPriceCheckReport(result);
  await sendSmtpAlert(smtp, {
    subject: `Vending price check — ${result.diffs.length} mismatch(es)`,
    textBody: text,
    smsText: `Vending: ${result.diffs.length} Shopify/Zhongda price mismatches`,
  });
}
