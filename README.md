# Screening NYC

Screening NYC is a Next.js application built around movie showtimes in New York City.

Its core is not a traditional movie database, but focuses on three main functions:

1. Discover current and upcoming showtimes across NYC cinemas  
2. After login, add movies or directors to a want list and subscribe to notifications  
3. After login, post movie ticket buy and sell information, with the platform acting only as an information board (no transactions handled on-site)

Live site: https://www.screeningnyc.com/

---

## Core Features

### 1. Browse On-Screening Showtimes

This is the main public entry point and does not require login.

Users can:

- View currently screening films on the homepage `/`
- Browse showtimes by date at `/date`
- Explore theaters on a map at `/map`
- View detailed showtimes for a film at `/films/[id]`
- Search for films; logged-in users can also resolve external TMDB results into internal pages

Key code areas:

- Pages
  - `app/(browse)/page.tsx`
  - `app/(browse)/date/page.tsx`
  - `app/(browse)/map/page.tsx`
  - `app/films/[id]/page.tsx`
- UI components
  - `components/FilmSearchBox.tsx`
  - `components/TheaterFilter.tsx`
  - `components/showtime/ShowtimeRow.tsx`
  - `components/map/*`
- Data fetching and caching
  - `lib/cache/public-data.ts`
  - `lib/movie/search-service.ts`
  - `lib/api/search-route.ts`
  - `lib/api/client-search.ts`
- Data ingestion and persistence
  - `lib/ingest/adapters/*`
  - `lib/ingest/services/persist_service.ts`
  - `lib/ingest/services/tmdb_service.ts`
  - `scripts/ingest_theater.ts`

Core data models:

- `Movie`: film metadata  
- `Theater`: cinema  
- `Showtime`: a specific screening  
- `Format`: screening format such as 35mm, 70mm, DCP  

---

### 2. Want List and Subscriptions (Logged-in Users)

This is the user state layer, covering both movies and directors.

After logging in, users can:

- Add movies to a want list  
- Add directors to a want list  
- View lists at `/me/want-list`  
- Enable or disable email notifications  
- Receive a notification when a film starts screening  
- Receive a weekly summary on Friday at noon  

Key code areas:

- Pages
  - `app/(browse)/me/page.tsx`
  - `app/(browse)/me/want-list/page.tsx`
- API
  - `app/api/me/movies/[movieId]/want/route.ts`
  - `app/api/me/people/[personId]/want/route.ts`
  - `app/api/me/movies/search/route.ts`
  - `app/api/me/people/search/route.ts`
  - `app/api/me/movies/resolve/route.ts`
  - `app/api/me/people/resolve/route.ts`
- Services
  - `lib/user-movies/service.ts`
  - `lib/user-directors/service.ts`
  - `lib/watchlist-reminders/service.ts`
  - `lib/watchlist-reminders/content.ts`
- Components
  - `components/movie/MovieListActions.tsx`
  - `components/person/DirectorListActions.tsx`
  - `components/me/want-list/*`
  - `components/auth/EmailReminderToggle.tsx`

Notification logic:

- Weekdays: notify when films start screening  
- Fridays: send a summary email  
- Email is a reminder layer, not a replacement for the in-app want list  

---

### 3. Ticket Marketplace

This is an information-only marketplace.

After logging in, users can:

- Browse active BUY and SELL posts at `/market`  
- Create a post at `/market/new` in four steps:
  1. Choose BUY or SELL  
  2. Select a film  
  3. Select a showtime  
  4. Enter quantity, price, seat info, and contact details  
- View posts per film and showtime at `/market/films/[id]`  
- Manage their posts at `/me/market`  

Platform boundaries:

- Only displays user-submitted information  
- Does not verify tickets or identities  
- Does not handle payments or escrow  
- Does not facilitate transactions on-site  
- Users exchange contact info and complete transactions externally  

Key code areas:

- Pages
  - `app/(browse)/market/page.tsx`
  - `app/(browse)/market/new/page.tsx`
  - `app/(browse)/market/films/[id]/page.tsx`
  - `app/(browse)/me/market/page.tsx`
- API
  - `app/api/me/marketplace/posts/route.ts`
  - `app/api/me/marketplace/posts/batch/route.ts`
  - `app/api/me/marketplace/posts/[postId]/route.ts`
  - `app/api/me/marketplace/posts/[postId]/contact/route.ts`
- Services
  - `lib/marketplace/service.ts`
  - `lib/marketplace/request-body.ts`
  - `lib/marketplace/http.ts`
  - `lib/marketplace/errors.ts`
- Components
  - `components/marketplace/*`

Design note: marketplace is structured as film -> showtime -> BUY or SELL, not a general second-hand platform.

---

## Supported Theaters

The system currently ingests and normalizes showtimes from:

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

Metadata is defined in `lib/ingest/config/theater_meta.ts`  
Adapters are in `lib/ingest/adapters/index.ts`

---

## Project Structure

\`\`\`text
screeningnyc/
├── app/
├── components/
├── lib/
├── prisma/
├── scripts/
└── tests/
\`\`\`

Organized by business domain rather than purely technical layers.

---

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

---

## Authentication

Supported login methods:

- Email and password  
- Magic link via email  
- Google login  

Configured in `auth.ts`

---

## Local Development

### Requirements

- Node.js 20+  
- PostgreSQL  

### Environment Variables

\`\`\`env
DATABASE_URL="..."
TMDB_API_KEY="..."
AUTH_SECRET="..."
APP_BASE_URL="http://localhost:3000"
CRON_SECRET="..."
REMINDER_BASE_URL="https://www.screeningnyc.com"
EMAIL_FROM="auth@example.com"
RESEND_API_KEY="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
\`\`\`

### Setup

\`\`\`bash
npm install
npx prisma migrate dev
npm run dev
\`\`\`

---

## Common Commands

\`\`\`bash
npm run dev
npm run typecheck
npm test
npm run lint
npm run build
\`\`\`

---

## Data Ingestion

\`\`\`bash
npm run ingest:theater
npm run cleanup:showtimes
npm run reminders:watchlist
\`\`\`

---

## Automation

GitHub Actions handle:

- CI checks  
- Daily ingestion  
- Cleanup of expired showtimes  
- Watchlist reminders  

---

## Notes

- `(browse)` is a route group and does not affect URLs  
- Map page uses dynamic connection to avoid static snapshot issues  
- Marketplace is strictly information sharing, not a transaction platform  