-- CreateTable
CREATE TABLE "InboundLine" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "externalId" TEXT,
    "documentType" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'ordered',
    "title" TEXT NOT NULL,
    "upc" TEXT,
    "vendorSku" TEXT,
    "qtyOrdered" INTEGER NOT NULL DEFAULT 0,
    "qtyReceived" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2),
    "unitOfMeasure" TEXT,
    "caseQtyBoxes" INTEGER,
    "tracking" TEXT,
    "carrier" TEXT,
    "dealer" TEXT,
    "offerFilter" TEXT,
    "dealernetOfferId" TEXT,
    "gmailMessageId" TEXT,
    "gmailLabel" TEXT,
    "shopifyVariantId" TEXT,
    "listingUrl" TEXT,
    "rawUrl" TEXT,
    "parseConfidence" DOUBLE PRECISION,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundLine_canonicalKey_key" ON "InboundLine"("canonicalKey");

-- CreateIndex
CREATE INDEX "InboundLine_shopId_stage_idx" ON "InboundLine"("shopId", "stage");

-- CreateIndex
CREATE INDEX "InboundLine_shopId_source_idx" ON "InboundLine"("shopId", "source");

-- CreateIndex
CREATE INDEX "InboundLine_shopId_direction_idx" ON "InboundLine"("shopId", "direction");

-- CreateIndex
CREATE INDEX "InboundLine_upc_idx" ON "InboundLine"("upc");

-- CreateIndex
CREATE INDEX "InboundLine_externalId_idx" ON "InboundLine"("externalId");

-- AddForeignKey
ALTER TABLE "InboundLine" ADD CONSTRAINT "InboundLine_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
