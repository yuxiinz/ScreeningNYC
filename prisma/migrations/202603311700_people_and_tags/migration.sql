CREATE TYPE "MoviePersonKind" AS ENUM ('DIRECTOR', 'CAST');

CREATE TABLE "Person" (
    "id" SERIAL NOT NULL,
    "tmdbId" INTEGER,
    "name" TEXT NOT NULL,
    "gender" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoviePerson" (
    "movieId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "kind" "MoviePersonKind" NOT NULL,
    "billingOrder" INTEGER,

    CONSTRAINT "MoviePerson_pkey" PRIMARY KEY ("movieId", "personId", "kind")
);

CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MovieTag" (
    "movieId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "MovieTag_pkey" PRIMARY KEY ("movieId", "tagId")
);

CREATE UNIQUE INDEX "Person_tmdbId_key"
ON "Person"("tmdbId");

CREATE INDEX "Person_name_idx"
ON "Person"("name");

CREATE INDEX "MoviePerson_personId_kind_idx"
ON "MoviePerson"("personId", "kind");

CREATE INDEX "MoviePerson_movieId_kind_billingOrder_idx"
ON "MoviePerson"("movieId", "kind", "billingOrder");

CREATE UNIQUE INDEX "Tag_slug_key"
ON "Tag"("slug");

CREATE UNIQUE INDEX "Tag_name_key"
ON "Tag"("name");

CREATE INDEX "MovieTag_tagId_movieId_idx"
ON "MovieTag"("tagId", "movieId");

ALTER TABLE "MoviePerson"
ADD CONSTRAINT "MoviePerson_movieId_fkey"
FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MoviePerson"
ADD CONSTRAINT "MoviePerson_personId_fkey"
FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MovieTag"
ADD CONSTRAINT "MovieTag_movieId_fkey"
FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MovieTag"
ADD CONSTRAINT "MovieTag_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
