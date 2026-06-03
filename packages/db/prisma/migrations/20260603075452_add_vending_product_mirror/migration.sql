-- CreateTable
CREATE TABLE "VendingProductMirror" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "barcode" TEXT,
    "sku" TEXT,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "shopifyPrice" DECIMAL(12,2),
    "shopifyQty" INTEGER,
    "zhongdaSku" TEXT,
    "zhongdaPrice" DECIMAL(12,2),
    "zhongdaQty" INTEGER,
    "syncStatus" TEXT NOT NULL DEFAULT 'shopify_only',
    "lastError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendingProductMirror_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendingProductMirror_shopId_barcode_idx" ON "VendingProductMirror"("shopId", "barcode");

-- CreateIndex
CREATE INDEX "VendingProductMirror_shopId_syncStatus_idx" ON "VendingProductMirror"("shopId", "syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "VendingProductMirror_shopId_variantId_key" ON "VendingProductMirror"("shopId", "variantId");

-- AddForeignKey
ALTER TABLE "VendingProductMirror" ADD CONSTRAINT "VendingProductMirror_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
