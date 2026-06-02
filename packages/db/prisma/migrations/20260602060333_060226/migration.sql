-- CreateTable
CREATE TABLE "ProductCatalog" (
    "id" TEXT NOT NULL,
    "barcode" TEXT,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "productType" TEXT,
    "vendor" TEXT,
    "tags" TEXT,
    "price" DECIMAL(12,2),
    "unitCost" DECIMAL(12,2),
    "inventoryQuantity" INTEGER,
    "status" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCatalog_variantId_key" ON "ProductCatalog"("variantId");

-- CreateIndex
CREATE INDEX "ProductCatalog_barcode_idx" ON "ProductCatalog"("barcode");

-- CreateIndex
CREATE INDEX "ProductCatalog_productType_idx" ON "ProductCatalog"("productType");
