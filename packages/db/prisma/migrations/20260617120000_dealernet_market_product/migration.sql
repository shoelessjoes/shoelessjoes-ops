-- CreateTable
CREATE TABLE "DealernetMarketProduct" (
    "id" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "upc" TEXT,
    "title" TEXT NOT NULL,
    "searchQuery" TEXT,
    "supplierYear" TEXT,
    "highBuy" DECIMAL(12,2),
    "lowSell" DECIMAL(12,2),
    "productUrl" TEXT,
    "listingUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'search',
    "matchScore" DOUBLE PRECISION,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealernetMarketProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealernetMarketProduct_canonicalKey_key" ON "DealernetMarketProduct"("canonicalKey");

-- CreateIndex
CREATE INDEX "DealernetMarketProduct_upc_idx" ON "DealernetMarketProduct"("upc");

-- CreateIndex
CREATE INDEX "DealernetMarketProduct_title_idx" ON "DealernetMarketProduct"("title");

-- CreateIndex
CREATE INDEX "DealernetMarketProduct_searchQuery_idx" ON "DealernetMarketProduct"("searchQuery");
