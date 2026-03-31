ALTER TABLE "WatchlistItem"
ADD COLUMN "addedWhileOnScreen" BOOLEAN;

CREATE TABLE "WatchlistSummaryDelivery" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "summaryDateKey" TEXT NOT NULL,
    "resendMessageId" TEXT,
    "sentToEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistSummaryDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WatchlistSummaryDelivery_userId_summaryDateKey_key"
ON "WatchlistSummaryDelivery"("userId", "summaryDateKey");

CREATE INDEX "WatchlistSummaryDelivery_summaryDateKey_idx"
ON "WatchlistSummaryDelivery"("summaryDateKey");

ALTER TABLE "WatchlistSummaryDelivery"
ADD CONSTRAINT "WatchlistSummaryDelivery_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
