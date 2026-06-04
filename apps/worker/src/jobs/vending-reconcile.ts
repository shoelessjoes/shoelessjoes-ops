import { matchShopifyToZhongdaGoods, parseZhongdaMoney } from "@dealernet-ops/core";
import { prisma } from "@dealernet-ops/db";
import { getOrCreateShopFromEnv } from "../shop.js";

async function main() {
  const shop = await getOrCreateShopFromEnv();

  const zhongdaRows = await prisma.zhongdaGoods.findMany({ where: { shopId: shop.id } });
  if (!zhongdaRows.length) {
    console.warn("[vending-reconcile] ZhongdaGoods empty — run npm run job:vending-fetch-zhongda-goods first.");
    return;
  }

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
  if (!mirrors.length) {
    console.warn("[vending-reconcile] VendingProductMirror empty — run export-catalog + vending-sync-shopify-mirror.");
    return;
  }

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

  console.log(
    `[vending-reconcile] ${mirrors.length} mirror row(s): ${linked} linked, ${unmatched} no Zhongda match`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
