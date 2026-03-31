-- CreateEnum
CREATE TYPE "ShowtimeStatus" AS ENUM ('SCHEDULED', 'CANCELED', 'COMPLETED');

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

    CONSTRAINT "Movie_pkey" PRIMARY KEY ("id")
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
    "shownTitle" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "sourceShowtimeId" TEXT,
    "fingerprint" TEXT,
    "status" "ShowtimeStatus" NOT NULL DEFAULT 'SCHEDULED',
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Showtime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Movie_tmdbId_key" ON "Movie"("tmdbId");

-- CreateIndex
CREATE INDEX "Movie_title_idx" ON "Movie"("title");

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

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_theaterId_fkey" FOREIGN KEY ("theaterId") REFERENCES "Theater"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Showtime" ADD CONSTRAINT "Showtime_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "Format"("id") ON DELETE SET NULL ON UPDATE CASCADE;
