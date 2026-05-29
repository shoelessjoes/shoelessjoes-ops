-- AlterTable: DealernetOfferLine - track case-qty boxes for case rows
ALTER TABLE "DealernetOfferLine"
ADD COLUMN "caseQtyBoxes" INTEGER;

-- AlterTable: DealernetMessage - classification and chat threading metadata
ALTER TABLE "DealernetMessage"
ADD COLUMN "referenceOfferId" TEXT,
ADD COLUMN "dealerCode" TEXT,
ADD COLUMN "messageType" TEXT,
ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DealernetMessage_messageType_idx" ON "DealernetMessage"("messageType");

-- CreateIndex
CREATE INDEX "DealernetMessage_referenceOfferId_idx" ON "DealernetMessage"("referenceOfferId");
