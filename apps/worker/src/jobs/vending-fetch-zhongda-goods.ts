import { fetchAllZhongdaGoods, parseZhongdaMoney } from "@dealernet-ops/core";
import { prisma } from "@dealernet-ops/db";
import { getOrCreateShopFromEnv } from "../shop.js";
import { loadZhongdaApiConfig } from "../zhongda-api-config.js";

async function main() {
  const shop = await getOrCreateShopFromEnv();
  const cfg = loadZhongdaApiConfig();

  console.log("[vending-fetch-zhongda-goods] Logging in via REST…");
  const rows = await fetchAllZhongdaGoods(cfg);
  console.log(`[vending-fetch-zhongda-goods] fetched ${rows.length} goods from Zhongda`);

  let upserts = 0;
  for (const g of rows) {
    await prisma.zhongdaGoods.upsert({
      where: {
        shopId_zhongdaId: { shopId: shop.id, zhongdaId: g.id },
      },
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
    upserts++;
  }

  console.log(`[vending-fetch-zhongda-goods] upserted ${upserts} row(s) into ZhongdaGoods`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
