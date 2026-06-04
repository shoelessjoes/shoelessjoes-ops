-- AlterTable
ALTER TABLE "VendingProductMirror" ADD COLUMN     "zhongdaCost" DECIMAL(12,2),
ADD COLUMN     "zhongdaGoodsId" INTEGER,
ADD COLUMN     "zhongdaGoodsName" TEXT;

-- CreateTable
CREATE TABLE "ZhongdaGoods" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "zhongdaId" INTEGER NOT NULL,
    "goodsNo" TEXT,
    "goodsName" TEXT NOT NULL,
    "costPrice" DECIMAL(12,2),
    "sellPrice" DECIMAL(12,2),
    "marketPrice" DECIMAL(12,2),
    "categoryName" TEXT,
    "brandName" TEXT,
    "unitName" TEXT,
    "imageUrl" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZhongdaGoods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZhongdaGoods_shopId_goodsName_idx" ON "ZhongdaGoods"("shopId", "goodsName");

-- CreateIndex
CREATE INDEX "ZhongdaGoods_shopId_goodsNo_idx" ON "ZhongdaGoods"("shopId", "goodsNo");

-- CreateIndex
CREATE UNIQUE INDEX "ZhongdaGoods_shopId_zhongdaId_key" ON "ZhongdaGoods"("shopId", "zhongdaId");

-- CreateIndex
CREATE INDEX "VendingProductMirror_shopId_zhongdaGoodsId_idx" ON "VendingProductMirror"("shopId", "zhongdaGoodsId");

-- AddForeignKey
ALTER TABLE "ZhongdaGoods" ADD CONSTRAINT "ZhongdaGoods_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
