CREATE TYPE "MarketplacePostType" AS ENUM ('BUY', 'SELL');

CREATE TYPE "MarketplacePostStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');

CREATE TABLE "MarketplacePost" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "showtimeId" INTEGER NOT NULL,
    "type" "MarketplacePostType" NOT NULL,
    "status" "MarketplacePostStatus" NOT NULL DEFAULT 'ACTIVE',
    "quantity" INTEGER NOT NULL,
    "priceCents" INTEGER,
    "seatInfo" TEXT,
    "contactSnapshot" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplacePost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketplaceMatchNotification" (
    "id" SERIAL NOT NULL,
    "triggerPostId" INTEGER NOT NULL,
    "recipientPostId" INTEGER NOT NULL,
    "resendMessageId" TEXT,
    "sentToEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceMatchNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplacePost_userId_showtimeId_type_key" ON "MarketplacePost"("userId", "showtimeId", "type");
CREATE INDEX "MarketplacePost_showtimeId_status_type_updatedAt_idx" ON "MarketplacePost"("showtimeId", "status", "type", "updatedAt");
CREATE INDEX "MarketplacePost_userId_status_updatedAt_idx" ON "MarketplacePost"("userId", "status", "updatedAt");
CREATE INDEX "MarketplacePost_status_type_updatedAt_idx" ON "MarketplacePost"("status", "type", "updatedAt");

CREATE UNIQUE INDEX "MarketplaceMatchNotification_triggerPostId_recipientPostId_key" ON "MarketplaceMatchNotification"("triggerPostId", "recipientPostId");
CREATE INDEX "MarketplaceMatchNotification_recipientPostId_idx" ON "MarketplaceMatchNotification"("recipientPostId");

ALTER TABLE "MarketplacePost"
ADD CONSTRAINT "MarketplacePost_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplacePost"
ADD CONSTRAINT "MarketplacePost_showtimeId_fkey"
FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceMatchNotification"
ADD CONSTRAINT "MarketplaceMatchNotification_triggerPostId_fkey"
FOREIGN KEY ("triggerPostId") REFERENCES "MarketplacePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceMatchNotification"
ADD CONSTRAINT "MarketplaceMatchNotification_recipientPostId_fkey"
FOREIGN KEY ("recipientPostId") REFERENCES "MarketplacePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
