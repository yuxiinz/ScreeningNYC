ALTER TABLE "Movie"
ADD COLUMN "productionCountriesText" TEXT;

ALTER TABLE "UserMovieWatch"
ALTER COLUMN "rating" TYPE DECIMAL(2,1)
USING "rating"::DECIMAL(2,1);
