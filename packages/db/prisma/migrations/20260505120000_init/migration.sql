-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopifyDomain" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shop_shopifyDomain_key" ON "Shop"("shopifyDomain");

CREATE TABLE "DealernetOffer" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "offerFilter" TEXT NOT NULL,
    "dealer" TEXT,
    "status" TEXT NOT NULL,
    "createdAtDn" TEXT,
    "offerTotal" DECIMAL(12,2),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offerDetailUrl" TEXT,

    CONSTRAINT "DealernetOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealernetOffer_offerId_offerFilter_key" ON "DealernetOffer"("offerId", "offerFilter");
CREATE INDEX "DealernetOffer_status_idx" ON "DealernetOffer"("status");

CREATE TABLE "DealernetOfferLine" (
    "id" TEXT NOT NULL,
    "dealernetOfferId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "offerFilter" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "upc" TEXT,
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2),
    "subtotal" DECIMAL(12,2),
    "perBoxUnitPrice" DECIMAL(12,2),
    "unitOfMeasure" TEXT,
    "trackingNumber" TEXT,
    "listingUrl" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT,
    "mappingStatus" TEXT NOT NULL DEFAULT 'pending',
    "matchedVariantId" TEXT,
    "mappingScore" DOUBLE PRECISION,
    "shopifySyncEventId" TEXT,

    CONSTRAINT "DealernetOfferLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DealernetOfferLine_dealernetOfferId_idx" ON "DealernetOfferLine"("dealernetOfferId");
CREATE INDEX "DealernetOfferLine_offerId_offerFilter_idx" ON "DealernetOfferLine"("offerId", "offerFilter");
CREATE INDEX "DealernetOfferLine_mappingStatus_idx" ON "DealernetOfferLine"("mappingStatus");

ALTER TABLE "DealernetOfferLine" ADD CONSTRAINT "DealernetOfferLine_dealernetOfferId_fkey" FOREIGN KEY ("dealernetOfferId") REFERENCES "DealernetOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealernetOfferLine" ADD CONSTRAINT "DealernetOfferLine_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DealernetMessage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "subject" TEXT,
    "sender" TEXT,
    "sentAt" TEXT,
    "messageUrl" TEXT,
    "offerId" TEXT,
    "body" TEXT,
    "isUnread" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealernetMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DealernetMessage_shopId_messageId_key" ON "DealernetMessage"("shopId", "messageId");
CREATE INDEX "DealernetMessage_capturedAt_idx" ON "DealernetMessage"("capturedAt");

ALTER TABLE "DealernetMessage" ADD CONSTRAINT "DealernetMessage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ShopifySyncRun" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'running',
    "statsJson" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ShopifySyncRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShopifySyncRun" ADD CONSTRAINT "ShopifySyncRun_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ShopifySyncEvent" (
    "id" TEXT NOT NULL,
    "syncRunId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "shopifyDraftOrderId" TEXT,
    "shopifyOrderId" TEXT,
    "status" TEXT NOT NULL,
    "payloadJson" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopifySyncEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopifySyncEvent_idempotencyKey_key" ON "ShopifySyncEvent"("idempotencyKey");

ALTER TABLE "ShopifySyncEvent" ADD CONSTRAINT "ShopifySyncEvent_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "ShopifySyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProductMappingOverride" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "upc" TEXT,
    "dealernetTitleNorm" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMappingOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductMappingOverride_shopId_dealernetTitleNorm_key" ON "ProductMappingOverride"("shopId", "dealernetTitleNorm");
CREATE INDEX "ProductMappingOverride_shopId_upc_idx" ON "ProductMappingOverride"("shopId", "upc");

ALTER TABLE "ProductMappingOverride" ADD CONSTRAINT "ProductMappingOverride_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PriceRecommendation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "barcode" TEXT,
    "title" TEXT NOT NULL,
    "shopifyPrice" DECIMAL(12,2),
    "highBuy" DECIMAL(12,2),
    "lowSell" DECIMAL(12,2),
    "sold30d" INTEGER NOT NULL DEFAULT 0,
    "action" TEXT NOT NULL,
    "suggestedPrice" DECIMAL(12,2),
    "rationale" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceRecommendation_shopId_computedAt_idx" ON "PriceRecommendation"("shopId", "computedAt");
CREATE INDEX "PriceRecommendation_shopId_action_idx" ON "PriceRecommendation"("shopId", "action");

ALTER TABLE "PriceRecommendation" ADD CONSTRAINT "PriceRecommendation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "upc" TEXT,
    "alertType" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "externalKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceAlert_shopId_upc_idx" ON "PriceAlert"("shopId", "upc");

ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "bodyPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "metaJson" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
