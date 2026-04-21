# Screening NYC

Screening NYC is a Next.js application for tracking repertory and specialty movie showtimes in New York City.

It is built around three product workflows:

1. Public showtime discovery for films currently screening or scheduled in NYC
2. Logged-in watchlist and watched-history tools for films and directors
3. Logged-in ticket marketplace posts for upcoming showtimes

Live site: https://www.screeningnyc.com/

## Product Scope

### 1. Public showtime discovery

Public users can:

- browse the home grid of scheduled films at `/`
- browse showtimes by date at `/date`
- browse theaters on the map at `/map`
- search films at `/api/movies/search`
- open film detail pages at `/films/[id]`
- browse directors at `/people` and person detail pages at `/people/[id]`

The public layer is cache-heavy and reads from normalized Prisma data, not directly from source sites.

### 2. Personal watchlist and watched history

Logged-in users can:

- add films to a want list
- add directors to a want list
- mark films as watched
- store ratings and short reviews
- import want or watched history from Douban or Letterboxd CSV exports
- manage watchlist and watched pages under `/me`
- receive email reminders when wanted films begin screening
- receive Friday summary emails for active watchlist matches

### 3. Ticket marketplace

Logged-in users can:

- browse active BUY and SELL posts at `/market`
- create a marketplace post from `/market/new`
- attach a post to one or more upcoming showtimes for a film
- manage their own posts at `/me/market`
- request contact details for matching posts

The marketplace is intentionally limited:

- Screening NYC is an information board, not a payment or escrow platform
- the platform does not verify tickets, identities, or transaction outcomes
- users exchange contact information and complete transactions off-platform

## Architecture Overview

The codebase is organized by product domain rather than by strict technical layer.

```text
app/                 App Router pages and API routes
components/          UI components grouped by product area
lib/api/             shared route helpers for search, resolve, and collection actions
lib/ingest/          scrapers, source normalization, TMDB enrichment, persistence helpers
lib/movie/           movie search, matching, display, canonical lookup
lib/people/          director search and TMDB resolution
lib/user-movies/     want, watched, import, and review logic
lib/user-directors/  director watchlist logic
lib/marketplace/     marketplace validation, service layer, and HTTP helpers
lib/watchlist-reminders/  email content and reminder orchestration
lib/cache/           public cache helpers and cache tags
prisma/              schema and migrations
scripts/             operational jobs
tests/               focused Node test suite
```

`app/(browse)` is a route group only; it does not appear in public URLs.

## How Data Flows

1. Theater-specific adapters in `lib/ingest/adapters/*` scrape source sites
2. Ingest services normalize titles, formats, times, directors, and identifiers
3. Prisma persists normalized `Movie`, `Person`, `Theater`, `Showtime`, and marketplace data
4. Public pages read cached Prisma queries from `lib/cache/public-data.ts`
5. Authenticated pages add user state on top of the same movie/showtime graph
6. Reminder and marketplace flows read the same normalized showtime records

This shared movie-showtime graph is the core of the product.

`Showtime` is the operational center of the product. Watchlists, reminders, market posts, and public browsing all depend on upcoming scheduled showtimes.

## Important Routes

### Public pages

- `/`
- `/date`
- `/map`
- `/films/[id]`
- `/films/tmdb/[tmdbId]`
- `/people`
- `/people/[id]`

### Authenticated pages

- `/me`
- `/me/want-list`
- `/me/watched`
- `/me/market`
- `/market/new`

### Core API routes

- `app/api/movies/search/route.ts`
- `app/api/people/search/route.ts`
- `app/api/me/movies/[movieId]/want/route.ts`
- `app/api/me/people/[personId]/want/route.ts`
- `app/api/me/movies/[movieId]/watched/route.ts`
- `app/api/me/movies/import/route.ts`
- `app/api/me/movies/search/route.ts`
- `app/api/me/people/search/route.ts`
- `app/api/me/movies/resolve/route.ts`
- `app/api/me/people/resolve/route.ts`
- `app/api/me/marketplace/posts/route.ts`
- `app/api/me/marketplace/posts/batch/route.ts`
- `app/api/me/marketplace/posts/[postId]/route.ts`
- `app/api/me/marketplace/posts/[postId]/contact/route.ts`
- `app/api/cache/revalidate/route.ts`

## Core Data Model

The main Prisma models are:

- `Movie`
- `Person`
- `MoviePerson`
- `Tag`
- `MovieTag`
- `Theater`
- `Format`
- `Showtime`
- `WatchlistItem`
- `DirectorWatchlistItem`
- `UserMovieWatch`
- `MarketplacePost`
- `MarketplaceMatchNotification`
- `WatchlistNotificationDelivery`
- `WatchlistSummaryDelivery`
- `DirectorWatchlistNotificationDelivery`
- `DirectorWatchlistSummaryDelivery`

## Ingest Coverage

Current theater adapters cover:

- Metrograph
- Film Forum
- Film at Lincoln Center
- IFC Center
- Quad Cinema
- Cinema Village
- Spectacle
- Roxy Cinema
- MoMA
- Museum of the Moving Image
- Anthology Film Archives
- BAM
- Angelika New York
- Village East by Angelika
- Cinema 123 by Angelika
- Paris Theater
- Nitehawk Williamsburg
- Nitehawk Prospect Park
- Japan Society

Theater metadata lives in `lib/ingest/config/theater_meta.ts`.
Adapters are in `lib/ingest/adapters/index.ts`.

## Tech Stack

- Next.js 16.2 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Prisma
- PostgreSQL
- Luxon
- NextAuth v5 beta
- Cheerio + fetch / JSON scraping
- Leaflet / React Leaflet
- Resend

## Authentication

Authentication is configured in `auth.ts` with NextAuth v5.

Supported providers:

- email + password
- magic link via Resend when configured
- Google OAuth when configured

## Local Development

### Requirements

- Node.js 20+
- PostgreSQL

### Setup

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open http://localhost:3000

### Environment Variables

Required for core app development:

```env
DATABASE_URL="postgresql://..."
AUTH_SECRET="..."
APP_BASE_URL="http://localhost:3000"
```

Required for TMDB-backed search/resolve and richer movie metadata:

```env
TMDB_API_KEY="..."
```

Optional auth and email features:

```env
EMAIL_FROM="Screening NYC <no-reply@example.com>"
RESEND_API_KEY="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

Optional automation and production operations:

```env
CRON_SECRET="..."
REMINDER_BASE_URL="https://www.screeningnyc.com"
```

```env
PARIS_VISTA_AUTH_URL="https://auth.moviexchange.com/connect/token"
PARIS_VISTA_API_BASE="https://digital-api.paristheaternyc.com/ocapi/v1"
PARIS_VISTA_SITE_ID="2001"
PARIS_VISTA_USERNAME="<required-username>"
PARIS_VISTA_PASSWORD="<required-password>"
PARIS_VISTA_CLIENT_ID="<required-client-id>"
```

The app also accepts `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `AUTH_RESEND_KEY` as fallbacks in the auth env helper.

## Common Commands

```bash
npm run dev
npm run typecheck
npm test
npm run lint
npm run build
```

Operational scripts:

```bash
npm run ingest:theater
npm run cleanup:showtimes
npm run cleanup:orphan-people
npm run backfill:showtime-end-times
npm run backfill:movie-tags-and-directors
npm run reminders:watchlist
```

## Automation and Operations

GitHub Actions currently run:

- `ci.yml`: typecheck, lint, and production build
- `daily_ingest.yml`: daily ingest plus public cache revalidation
- `cleanup_showtimes.yml`: expired showtime cleanup every 15 minutes plus today-sensitive cache revalidation
- `watchlist_reminders.yml`: watchlist reminder job around noon America/New_York

Cache revalidation is handled by `app/api/cache/revalidate/route.ts` and protected by `CRON_SECRET`.

## Notes and Constraints

- The project is not a general movie encyclopedia; it is anchored to NYC screening data
- some person pages combine local records with TMDB-only filmography when local coverage is incomplete
- reminder delivery is designed around noon in `America/New_York`
- the marketplace is intentionally narrow and tied to specific showtimes, not free-form listings
- public pages rely on Next cache tags and scheduled revalidation jobs
