# Screening NYC

Screening NYC is a Next.js application that aggregates screenings from independent movie theaters in New York City. It ingests showtimes, normalizes movie and theater data into PostgreSQL, and serves browsing pages for films, dates, and theater locations.

## Live

- https://www.screeningnyc.com/

## Features

- Film aggregation from Metrograph, Film Forum, IFC Center, Quad Cinema, and MoMA
- Browse all currently scheduled films
- Browse screenings by date with theater filters
- Map view for theater locations and quick theater-specific lookup
- Film detail pages with grouped showtimes
- Search across films, including titles without active showtimes
- TMDB-backed metadata enrichment when `TMDB_API_KEY` is available

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4 with shared design tokens in `app/globals.css`
- Prisma ORM
- PostgreSQL
- Luxon for timezone-aware date handling
- Leaflet / React Leaflet for the map
- Cheerio / Axios / fetch-based ingestion adapters

## Project Structure

```text
screeningnyc/
├── app/
│   ├── (browse)/              # Route group for /, /date, /map
│   │   ├── layout.tsx         # Shared browse shell + header
│   │   ├── page.tsx           # Homepage
│   │   ├── date/page.tsx      # Date-based browsing
│   │   └── map/page.tsx       # Map page
│   ├── films/[id]/page.tsx    # Film detail page
│   ├── api/movies/search/route.ts
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── Header.tsx
│   ├── FilmSearchBox.tsx
│   ├── TheaterFilter.tsx
│   ├── DateSelector.tsx
│   ├── BackButton.tsx
│   ├── movie/
│   │   ├── MovieExternalLinks.tsx
│   │   └── PosterImage.tsx
│   └── map/
├── lib/
│   ├── prisma.ts
│   ├── timezone.ts
│   ├── movie/
│   │   ├── display.ts
│   │   └── search.ts
│   └── ingest/
│       ├── adapters/          # Theater-specific scrapers
│       ├── config/            # Theater metadata
│       ├── core/              # Shared ingest parsing utilities
│       └── services/          # TMDB + persistence services
├── prisma/
│   └── schema.prisma
├── scripts/
│   └── ingest_theater.ts
└── .github/workflows/
    ├── ci.yml
    └── daily_ingest.yml
```

## Data Model

- `Movie`: canonical movie record plus enriched metadata and external links
- `Theater`: theater identity, source metadata, and coordinates
- `Showtime`: scheduled screening tied to a movie and theater
- `Format`: normalized format labels such as `35mm`, `70mm`, `DCP`, `IMAX`

## Timezone

The app treats `America/New_York` as the canonical application timezone for date browsing, grouped showtimes, and ingest parsing. Shared helpers live in `lib/timezone.ts`.

## Setup

Requirements:

- Node.js 20
- PostgreSQL

Create `.env`:

```env
DATABASE_URL="postgresql://..."
TMDB_API_KEY="..."
```

`TMDB_API_KEY` is optional.

Run locally:

```bash
npm install
npx prisma generate
npm run dev
```

Open `http://localhost:3000`.

## Ingestion

Run the theater ingest manually:

```bash
npm run ingest:theater
```

You can also pass theater slugs as arguments to limit the run:

```bash
npm run ingest:theater -- metrograph filmforum
```

## Quality Checks

Typecheck:

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Production build:

```bash
npm run build
```

## Deployment and Automation

- Vercel handles application deployment on push.
- GitHub Actions `ci.yml` runs install, Prisma client generation, Next route type generation, typecheck, lint, and build.
- GitHub Actions `daily_ingest.yml` runs the daily ingest job and expects `DATABASE_URL` and `TMDB_API_KEY` secrets.

## Notes

- The route group `app/(browse)` is an internal App Router grouping. It does not change public URLs.
- The only public API route currently used by the frontend is `/api/movies/search`.
- Poster images are stored as remote URLs from TMDB and theater sites.
