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
- Email/password, magic link, and Google sign-in
- User dashboard with account state, Friday watchlist summaries, and noon new-on-screen reminders

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
AUTH_SECRET="..."
CRON_SECRET="..."
APP_BASE_URL="http://localhost:3000"
REMINDER_BASE_URL="https://www.screeningnyc.com"
EMAIL_FROM="auth@example.com"
RESEND_API_KEY="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

`TMDB_API_KEY` is optional.
`AUTH_SECRET`, `EMAIL_FROM`, and `RESEND_API_KEY` are required for auth email flows.
`CRON_SECRET` is required for the cache revalidation endpoint used by scheduled jobs.
`REMINDER_BASE_URL` is optional and lets reminder emails point at the public site even when local auth still uses `APP_BASE_URL`.
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are required for Google SSO.

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

Clean up expired showtimes (keeps `Showtime` operationally future-only):

```bash
npm run cleanup:showtimes
```

Backfill missing `endTime` values and then clean expired showtimes (one-time rollout helper):

```bash
npm run backfill:showtime-end-times
```

Send watchlist reminder emails manually:

```bash
npm run reminders:watchlist -- --force
```

Force the Friday summary branch for testing:

```bash
npm run reminders:watchlist -- --force --mode=summary
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
- GitHub Actions `daily_ingest.yml` runs the daily ingest job, then revalidates public cache tags. It expects `DATABASE_URL`, `TMDB_API_KEY`, `CRON_SECRET`, and `REMINDER_BASE_URL` secrets.
- GitHub Actions `cleanup_showtimes.yml` runs every 15 minutes, deletes expired showtimes from `Showtime`, then revalidates today-sensitive cache tags. It expects `DATABASE_URL`, `CRON_SECRET`, and `REMINDER_BASE_URL` secrets.
- GitHub Actions `watchlist_reminders.yml` runs around noon in `America/New_York` and sends either a Friday summary or a newly-on-screen reminder email.

Manual map cache refresh:

```bash
curl --fail \
  -X POST https://www.screeningnyc.com/api/cache/revalidate \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  --data '{"tags":["map-public","theater-directory"]}'
```

## Notes

- The route group `app/(browse)` is an internal App Router grouping. It does not change public URLs.
- The only public API route currently used by the frontend is `/api/movies/search`.
- Poster images are stored as remote URLs from TMDB and theater sites.
