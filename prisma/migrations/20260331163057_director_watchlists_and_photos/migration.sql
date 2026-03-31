-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "photoUrl" TEXT;

-- CreateTable
CREATE TABLE "DirectorWatchlistItem" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" INTEGER NOT NULL,
    "addedWhileOnScreen" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectorWatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorWatchlistSummaryDelivery" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "summaryDateKey" TEXT NOT NULL,
    "resendMessageId" TEXT,
    "sentToEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectorWatchlistSummaryDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorWatchlistNotificationDelivery" (
    "id" SERIAL NOT NULL,
    "directorWatchlistItemId" INTEGER NOT NULL,
    "movieId" INTEGER NOT NULL,
    "resendMessageId" TEXT,
    "sentToEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectorWatchlistNotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectorWatchlistItem_personId_idx" ON "DirectorWatchlistItem"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorWatchlistItem_userId_personId_key" ON "DirectorWatchlistItem"("userId", "personId");

-- CreateIndex
CREATE INDEX "DirectorWatchlistSummaryDelivery_summaryDateKey_idx" ON "DirectorWatchlistSummaryDelivery"("summaryDateKey");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorWatchlistSummaryDelivery_userId_summaryDateKey_key" ON "DirectorWatchlistSummaryDelivery"("userId", "summaryDateKey");

-- CreateIndex
CREATE INDEX "DirectorWatchlistNotificationDelivery_movieId_idx" ON "DirectorWatchlistNotificationDelivery"("movieId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorWatchlistNotificationDelivery_directorWatchlistItem_key" ON "DirectorWatchlistNotificationDelivery"("directorWatchlistItemId", "movieId");

-- AddForeignKey
ALTER TABLE "DirectorWatchlistItem" ADD CONSTRAINT "DirectorWatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorWatchlistItem" ADD CONSTRAINT "DirectorWatchlistItem_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorWatchlistSummaryDelivery" ADD CONSTRAINT "DirectorWatchlistSummaryDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorWatchlistNotificationDelivery" ADD CONSTRAINT "DirectorWatchlistNotificationDelivery_directorWatchlistIte_fkey" FOREIGN KEY ("directorWatchlistItemId") REFERENCES "DirectorWatchlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorWatchlistNotificationDelivery" ADD CONSTRAINT "DirectorWatchlistNotificationDelivery_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
