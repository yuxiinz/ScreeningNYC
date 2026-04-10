-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ShowtimeStatus" AS ENUM ('SCHEDULED', 'CANCELED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MoviePersonKind" AS ENUM ('DIRECTOR', 'CAST');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL,
    "watchlistEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Movie" (
    "id" SERIAL NOT NULL,
    "tmdbId" INTEGER,
    "title" TEXT NOT NULL,
    "originalTitle" TEXT,
    "releaseDate" TIMESTAMP(3),
    "runtimeMinutes" INTEGER,
    "overview" TEXT,
    "posterUrl" TEXT,
    "backdropUrl" TEXT,
    "imdbUrl" TEXT,
    "doubanUrl" TEXT,
    "letterboxdUrl" TEXT,
    "officialSiteUrl" TEXT,
    "genresText" TEXT,
    "directorText" TEXT,
    "castText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productionCountriesText" TEXT,

    CONSTRAINT "Movie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" SERIAL NOT NULL,
    "tmdbId" INTEGER,
    "name" TEXT NOT NULL,
    "gender" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "photoUrl" TEXT,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoviePerson" (
    "movieId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "kind" "MoviePersonKind" NOT NULL,
    "billingOrder" INTEGER,

    CONSTRAINT "MoviePerson_pkey" PRIMARY KEY ("movieId","personId","kind")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovieTag" (
    "movieId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "MovieTag_pkey" PRIMARY KEY ("movieId","tagId")
);

-- CreateTable
CREATE TABLE "Theater" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceTheaterId" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "borough" TEXT,
    "officialSiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theater_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Format" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Format_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Showtime" (
    "id" SERIAL NOT NULL,
    "movieId" INTEGER NOT NULL,
    "theaterId" INTEGER NOT NULL,
    "formatId" INTEGER,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "runtimeMinutes" INTEGER,
    "ticketUrl" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "sourceShowtimeId" TEXT,
    "fingerprint" TEXT,
    "status" "ShowtimeStatus" NOT NULL DEFAULT 'SCHEDULED',
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shownTitle" TEXT,

    CONSTRAINT "Showtime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "movieId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "addedWhileOnScreen" BOOLEAN,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "WatchlistSummaryDelivery" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "summaryDateKey" TEXT NOT NULL,
    "resendMessageId" TEXT,
    "sentToEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistSummaryDelivery_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "UserMovieWatch" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "movieId" INTEGER NOT NULL,
    "rating" DECIMAL(2,1),
    "reviewText" TEXT,
    "reviewWordCount" INTEGER NOT NULL DEFAULT 0,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMovieWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistNotificationDelivery" (
    "id" SERIAL NOT NULL,
    "watchlistItemId" INTEGER NOT NULL,
    "showtimeId" INTEGER NOT NULL,
    "resendMessageId" TEXT,
    "sentToEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistNotificationDelivery_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Movie_tmdbId_key" ON "Movie"("tmdbId");

-- CreateIndex
CREATE INDEX "Movie_title_idx" ON "Movie"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Person_tmdbId_key" ON "Person"("tmdbId");

-- CreateIndex
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE INDEX "MoviePerson_personId_kind_idx" ON "MoviePerson"("personId", "kind");

-- CreateIndex
CREATE INDEX "MoviePerson_movieId_kind_billingOrder_idx" ON "MoviePerson"("movieId", "kind", "billingOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "MovieTag_tagId_movieId_idx" ON "MovieTag"("tagId", "movieId");

-- CreateIndex
CREATE UNIQUE INDEX "Theater_slug_key" ON "Theater"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Theater_sourceTheaterId_key" ON "Theater"("sourceTheaterId");

-- CreateIndex
CREATE UNIQUE INDEX "Format_name_key" ON "Format"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Showtime_fingerprint_key" ON "Showtime"("fingerprint");

-- CreateIndex
CREATE INDEX "Showtime_startTime_idx" ON "Showtime"("startTime");

-- CreateIndex
CREATE INDEX "Showtime_theaterId_startTime_idx" ON "Showtime"("theaterId", "startTime");

-- CreateIndex
CREATE INDEX "WatchlistItem_movieId_idx" ON "WatchlistItem"("movieId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_movieId_key" ON "WatchlistItem"("userId", "movieId");

-- CreateIndex
CREATE INDEX "DirectorWatchlistItem_personId_idx" ON "DirectorWatchlistItem"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorWatchlistItem_userId_personId_key" ON "DirectorWatchlistItem"("userId", "personId");

-- CreateIndex
CREATE INDEX "WatchlistSummaryDelivery_summaryDateKey_idx" ON "WatchlistSummaryDelivery"("summaryDateKey");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistSummaryDelivery_userId_summaryDateKey_key" ON "WatchlistSummaryDelivery"("userId", "summaryDateKey");

-- CreateIndex
CREATE INDEX "DirectorWatchlistSummaryDelivery_summaryDateKey_idx" ON "DirectorWatchlistSummaryDelivery"("summaryDateKey");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorWatchlistSummaryDelivery_userId_summaryDateKey_key" ON "DirectorWatchlistSummaryDelivery"("userId", "summaryDateKey");

-- CreateIndex
CREATE INDEX "UserMovieWatch_movieId_watchedAt_idx" ON "UserMovieWatch"("movieId", "watchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserMovieWatch_userId_movieId_key" ON "UserMovieWatch"("userId", "movieId");

-- CreateIndex
CREATE INDEX "WatchlistNotificationDelivery_showtimeId_idx" ON "WatchlistNotificationDelivery"("showtimeId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistNotificationDelivery_watchlistItemId_showtimeId_key" ON "WatchlistNotificationDelivery"("watchlistItemId", "showtimeId");

-- CreateIndex
CREATE INDEX "DirectorWatchlistNotificationDelivery_movieId_idx" ON "DirectorWatchlistNotificationDelivery"("movieId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorWatchlistNotificationDelivery_directorWatchlistItem_key" ON "DirectorWatchlistNotificationDelivery"("directorWatchlistItemId", "movieId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoviePerson" ADD CONSTRAINT "MoviePerson_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoviePerson" ADD CONSTRAINT "MoviePerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieTag" ADD CONSTRAINT "MovieTag_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovieTag" ADD CONSTRAINT "MovieTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "Format"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_theaterId_fkey" FOREIGN KEY ("theaterId") REFERENCES "Theater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorWatchlistItem" ADD CONSTRAINT "DirectorWatchlistItem_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorWatchlistItem" ADD CONSTRAINT "DirectorWatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistSummaryDelivery" ADD CONSTRAINT "WatchlistSummaryDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorWatchlistSummaryDelivery" ADD CONSTRAINT "DirectorWatchlistSummaryDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMovieWatch" ADD CONSTRAINT "UserMovieWatch_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMovieWatch" ADD CONSTRAINT "UserMovieWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistNotificationDelivery" ADD CONSTRAINT "WatchlistNotificationDelivery_showtimeId_fkey" FOREIGN KEY ("showtimeId") REFERENCES "Showtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistNotificationDelivery" ADD CONSTRAINT "WatchlistNotificationDelivery_watchlistItemId_fkey" FOREIGN KEY ("watchlistItemId") REFERENCES "WatchlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorWatchlistNotificationDelivery" ADD CONSTRAINT "DirectorWatchlistNotificationDelivery_directorWatchlistIte_fkey" FOREIGN KEY ("directorWatchlistItemId") REFERENCES "DirectorWatchlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorWatchlistNotificationDelivery" ADD CONSTRAINT "DirectorWatchlistNotificationDelivery_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

