# ScreeningNYC Agent Playbook


This note is for future agents who need to keep the film-showtime ingest running or extend it with new theaters. Environment is already set up; focus on how things fit together.

## First Principles
Please think in terms of first principles. Don’t always assume that I know exactly what I want and how to get it. Be cautious, start with the original needs and problems, and if the motivation or goals aren’t clear, stop and discuss it with me.

## Proposal Guidelines
When asked to provide a modification or refactoring proposal, you must adhere to the following guidelines:
Proposals that are merely compatible or serve as workarounds are not permitted.
Over-engineering is not permitted; maintain the shortest possible implementation path without violating the first requirement. Proposals that go beyond the requirements I have provided—such as fallback or downgrade solutions—are not permitted, as these may cause business logic discrepancies.
- You must ensure the proposal’s logic is correct and must undergo end-to-end logical validation.

## Ingest anatomy
- Entry: `scripts/ingest_theater.ts` builds `THEATER_CONFIGS`, picks a scraper via `getShowtimeScraper`, and loops theaters sequentially.
- Adapters return `ScrapedShowtime[]` (see `lib/ingest/adapters/types.ts`): required `movieTitle`, `startTimeRaw`; optional metadata such as `ticketUrl`, `directorText`, `releaseYear`, `runtimeMinutes`, `posterUrl`, `rawFormat`, `tmdbTitleCandidates`, `sourceShowtimeId`.
- Times: Provide local (NYC) strings; parsing is handled by `parseStartTime` in `lib/ingest/services/persist_service.ts` using `APP_TIMEZONE = America/New_York`.
- Dedup: Fingerprint is `theaterSlug | canonical movie title | UTC start time | format`. Duplicates are skipped; missing fingerprints for the next 30 days are marked `CANCELED`.
- Retention: expired showtimes are periodically hard-deleted by `scripts/cleanup_expired_showtimes.ts`; `scripts/backfill_showtime_end_times.ts` can backfill `endTime` once during rollout.
- Programs vs features: `isProgramContent` flags festival/series language; program items skip TMDB and are stored via `upsertLocalMovie` with `genresText: 'Program'`.
- Formats are normalized by `normalizeFormat`; unknown values fall back to `Standard`.

## Key files / map
- `scripts/ingest_theater.ts`: config + run loop; `THEATER_SLUG_GROUPS` handles Angelika aliases.
- `lib/ingest/adapters/index.ts`: slug → scraper switch.
- Adapter implementations in `lib/ingest/adapters/*_adapter.ts` (metrograph, filmforum, ifc, quad, moma, momi, anthology, bam, angelika).
- `lib/ingest/config/theater_meta.ts`: address/coords per slug.
- `lib/ingest/core/*`: parsing helpers (`datetime`, `meta`, `text`, `url`, `http`).
- `lib/ingest/services/persist_service.ts`: dedup, TMDB/local upserts, format normalization, cancel logic.
- `lib/ingest/services/tmdb_service.ts`: TMDB search + scoring.
- `prisma/schema.prisma`: Movie/Theater/Showtime/Format schema; `shownTitle` is optional depending on column availability check.
- Automation: `.github/workflows/daily_ingest.yml` runs `npm run ingest:theater` daily at `0 10 * * *`.

## Common commands
- Run all theaters: `npm run ingest:theater`
- Limit scope: `npm run ingest:theater -- metrograph filmforum quad`
  - Angelika aliases: `angelika`, `angelikanyc`, `angelikaev`, `angelika123` → three sites.

## Adding or fixing a theater scraper
1) Add adapter file under `lib/ingest/adapters/` that exports `scrape<Theater>Showtimes({ sourceUrl, theaterSlug })`. Reuse helpers in `lib/ingest/core/*` (`fetchHtml`, `normalizeDateLabel`, `parseShowtime`, `parseCommaSeparatedMeta`, `buildAbsoluteUrl`, etc.).
2) Register the scraper in `lib/ingest/adapters/index.ts` and add a `THEATER_CONFIGS` entry in `scripts/ingest_theater.ts` (include `sourceUrl`, `sourceName`, `officialSiteUrl`, and slug).
3) Add address/coords to `lib/ingest/config/theater_meta.ts`; keep slug consistent with `THEATER_CONFIGS`.
4) If a slug should alias others (like Angelika), update `THEATER_SLUG_GROUPS` in `scripts/ingest_theater.ts`.
5) Run `npm run ingest:theater -- <slug>` and watch console counts: raw, parsed, deduped, parseFailed, upserted. Failures set non-zero exit code.

## TMDB enrichment notes
- Optional: if `TMDB_API_KEY` is missing the run still succeeds, storing local movies only.
- Matching lives in `lib/ingest/services/tmdb_service.ts`; pass `directorText`, `releaseYear`, `runtimeMinutes`, and `tmdbTitleCandidates` when available for better scores.
- Skip TMDB for obvious programs/series; the adapter can set `preferMovieTitleForDisplay` or `matchedMovieTitleHint` to bias titles.

## Troubleshooting
- Parse failures: log shows `[slug] Failed to parse time: ... | <startTimeRaw>`. Inspect adapter output and ensure `startTimeRaw` has a date + time (or something `parseStartTime` can infer a year for).
- Bad posters: `persist_service.isBadPosterUrl` filters veezi/placeholder assets; supply better URLs from the theater page when possible.
- Seen duplicates: same fingerprint means same canonical title, UTC time, and format. If a theater legitimately shows multiple formats at the same time, vary `rawFormat`.
- If Prisma complains about `shownTitle`: `supportsShowtimeShownTitleColumn` guards it, so leave `shownTitle` optional.

## Safe coding reminders
- This repo runs on Next.js 16 with breaking changes—check `node_modules/next/dist/docs/` before altering app code.
- Timezone-sensitive logic assumes `America/New_York`; avoid hardcoding other zones.
