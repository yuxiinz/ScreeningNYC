// scripts/ingest_theater.ts

import 'dotenv/config'
import { DateTime } from 'luxon'
import { getShowtimeScraper } from '../lib/ingest/adapters'
import { THEATER_META } from '../lib/ingest/config/theater_meta'
import { normalizeScreeningMovieTitle } from '../lib/ingest/core/screening_title'
import { APP_TIMEZONE } from '../lib/timezone'
import { findLocalMovieByImportMatch } from '../lib/movie/match'
import { shouldAttemptCanonicalTmdbLookup } from '../lib/movie/canonical-lookup'
import {
  searchTmdbMovie,
  canonicalizeTitle,
} from '../lib/ingest/services/tmdb_service'
import {
  upsertTheater,
  upsertFormat,
  upsertMovie,
  upsertLocalMovie,
  mergeMovieMetadata,
  upsertShowtime,
  markMissingShowtimesAsCanceled,
  getIngestTableCounts,
  normalizeFormat,
  parseStartTime,
  buildFingerprint,
  deleteExpiredShowtimesBatch,
  disconnectPrisma,
} from '../lib/ingest/services/persist_service'

type KnownTheaterSlug = keyof typeof THEATER_META

type TheaterIngestConfig = {
  theaterName: string
  theaterSlug: KnownTheaterSlug
  sourceName: string
  sourceUrl: string
  officialSiteUrl?: string
}

type TheaterRunStats = {
  theaterSlug: string
  theaterName: string
  rawCount: number
  parsedCount: number
  dedupedCount: number
  parseFailedCount: number
  upsertedCount: number
  success: boolean
  durationMs: number
  error?: string
}

const TMDB_API_KEY = process.env.TMDB_API_KEY || ''
const THEATER_SLUG_GROUPS: Record<string, string[]> = {
  angelika: ['angelikanyc', 'angelikaev', 'angelika123'],
  nitehawk: ['nitehawkwilliamsburg', 'nitehawkprospectpark'],
}

const THEATER_CONFIGS: TheaterIngestConfig[] = [
  {
    theaterName: 'Metrograph',
    theaterSlug: 'metrograph',
    sourceName: 'metrograph',
    sourceUrl:
      process.env.METROGRAPH_SHOWTIMES_URL || 'https://metrograph.com/film/',
    officialSiteUrl:
      process.env.METROGRAPH_OFFICIAL_URL || 'https://metrograph.com/',
  },
  {
    theaterName: 'Film Forum',
    theaterSlug: 'filmforum',
    sourceName: 'filmforum',
    sourceUrl:
      process.env.FILMFORUM_SHOWTIMES_URL || 'https://filmforum.org/now_playing',
    officialSiteUrl:
      process.env.FILMFORUM_OFFICIAL_URL || 'https://filmforum.org',
  },
  {
    theaterName: 'Film at Lincoln Center',
    theaterSlug: 'flc',
    sourceName: 'flc',
    sourceUrl:
      process.env.FLC_SHOWTIMES_URL || 'https://api.filmlinc.org/showtimes',
    officialSiteUrl:
      process.env.FLC_OFFICIAL_URL || 'https://www.filmlinc.org/',
  },
  {
    theaterName: 'IFC Center',
    theaterSlug: 'ifc',
    sourceName: 'ifc',
    sourceUrl: process.env.IFC_SHOWTIMES_URL || 'https://www.ifccenter.com/',
    officialSiteUrl:
      process.env.IFC_OFFICIAL_URL || 'https://www.ifccenter.com',
  },
  {
    theaterName: 'Quad Cinema',
    theaterSlug: 'quad',
    sourceName: 'quad',
    sourceUrl:
      process.env.QUAD_SHOWTIMES_URL || 'https://quadcinema.com/all/',
    officialSiteUrl:
      process.env.QUAD_OFFICIAL_URL || 'https://quadcinema.com',
  },
  {
    theaterName: 'Cinema Village',
    theaterSlug: 'cinemavillage',
    sourceName: 'cinemavillage',
    sourceUrl:
      process.env.CINEMAVILLAGE_SHOWTIMES_URL ||
      'https://www.cinemavillage.com/calendar/',
    officialSiteUrl:
      process.env.CINEMAVILLAGE_OFFICIAL_URL ||
      'https://www.cinemavillage.com/',
  },
  {
    theaterName: 'Spectacle',
    theaterSlug: 'spectacle',
    sourceName: 'spectacle',
    sourceUrl:
      process.env.SPECTACLE_SHOWTIMES_URL ||
      'https://www.spectacletheater.com/',
    officialSiteUrl:
      process.env.SPECTACLE_OFFICIAL_URL ||
      'https://www.spectacletheater.com/',
  },
  {
    theaterName: 'Roxy Cinema',
    theaterSlug: 'roxy',
    sourceName: 'roxy',
    sourceUrl:
      process.env.ROXY_SHOWTIMES_URL ||
      'https://www.roxycinemanewyork.com/now-showing/',
    officialSiteUrl:
      process.env.ROXY_OFFICIAL_URL ||
      'https://www.roxycinemanewyork.com/',
  },
  {
    theaterName: 'MoMA',
    theaterSlug: 'moma',
    sourceName: 'moma',
    sourceUrl:
      process.env.MOMA_SHOWTIMES_URL ||
      'https://www.moma.org/calendar/?happening_filter=Films&locale=en&location=both',
    officialSiteUrl: process.env.MOMA_OFFICIAL_URL || 'https://www.moma.org',
  },
  {
    theaterName: 'Museum of the Moving Image',
    theaterSlug: 'momi',
    sourceName: 'momi',
    sourceUrl:
      process.env.MOMI_SHOWTIMES_URL ||
      'https://movingimage.org/events/list/?tribe_filterbar_category_custom%5B0%5D=253&tribe_filterbar_category_custom%5B1%5D=230',
    officialSiteUrl:
      process.env.MOMI_OFFICIAL_URL || 'https://movingimage.org/',
  },
  {
    theaterName: 'Anthology Film Archives',
    theaterSlug: 'anthology',
    sourceName: 'anthology',
    sourceUrl:
      process.env.ANTHOLOGY_SHOWTIMES_URL ||
      'https://ticketing.uswest.veezi.com/sessions/?siteToken=bsrxtagjxmgh2qy0b6p646xdcr',
    officialSiteUrl:
      process.env.ANTHOLOGY_OFFICIAL_URL ||
      'https://www.anthologyfilmarchives.org',
  },
  {
    theaterName: 'BAM',
    theaterSlug: 'bam',
    sourceName: 'bam',
    sourceUrl: process.env.BAM_SHOWTIMES_URL || 'https://www.bam.org/film/',
    officialSiteUrl: process.env.BAM_OFFICIAL_URL || 'https://www.bam.org/',
  },
  {
    theaterName: 'Angelika New York',
    theaterSlug: 'angelikaNYC',
    sourceName: 'angelika',
    sourceUrl:
      process.env.ANGELIKA_NYC_SHOWTIMES_URL ||
      'https://angelikafilmcenter.com/nyc/now-playing',
    officialSiteUrl:
      process.env.ANGELIKA_NYC_OFFICIAL_URL ||
      'https://angelikafilmcenter.com/nyc/',
  },
  {
    theaterName: 'Village East by Angelika',
    theaterSlug: 'angelikaEV',
    sourceName: 'angelika',
    sourceUrl:
      process.env.ANGELIKA_EV_SHOWTIMES_URL ||
      'https://angelikafilmcenter.com/villageeast/now-playing',
    officialSiteUrl:
      process.env.ANGELIKA_EV_OFFICIAL_URL ||
      'https://angelikafilmcenter.com/villageeast/',
  },
  {
    theaterName: 'Cinema 123 by Angelika',
    theaterSlug: 'angelika123',
    sourceName: 'angelika',
    sourceUrl:
      process.env.ANGELIKA_123_SHOWTIMES_URL ||
      'https://angelikafilmcenter.com/cinemas123/now-playing',
    officialSiteUrl:
      process.env.ANGELIKA_123_OFFICIAL_URL ||
      'https://angelikafilmcenter.com/cinemas123/',
  },
  {
    theaterName: 'Paris Theater',
    theaterSlug: 'paris',
    sourceName: 'paris',
    sourceUrl:
      process.env.PARIS_SHOWTIMES_URL || 'https://www.paristheaternyc.com/',
    officialSiteUrl:
      process.env.PARIS_OFFICIAL_URL || 'https://www.paristheaternyc.com/',
  },
  {
    theaterName: 'Nitehawk Williamsburg',
    theaterSlug: 'nitehawkwilliamsburg',
    sourceName: 'nitehawk',
    sourceUrl:
      process.env.NITEHAWK_WILLIAMSBURG_SHOWTIMES_URL ||
      'https://nitehawkcinema.com/williamsburg/',
    officialSiteUrl:
      process.env.NITEHAWK_WILLIAMSBURG_OFFICIAL_URL ||
      'https://nitehawkcinema.com/williamsburg/',
  },
  {
    theaterName: 'Nitehawk Prospect Park',
    theaterSlug: 'nitehawkprospectpark',
    sourceName: 'nitehawk',
    sourceUrl:
      process.env.NITEHAWK_PROSPECTPARK_SHOWTIMES_URL ||
      'https://nitehawkcinema.com/prospectpark/',
    officialSiteUrl:
      process.env.NITEHAWK_PROSPECTPARK_OFFICIAL_URL ||
      'https://nitehawkcinema.com/prospectpark/',
  },
  {
    theaterName: 'Japan Society',
    theaterSlug: 'japansociety',
    sourceName: 'japansociety',
    sourceUrl:
      process.env.JAPANSOCIETY_SHOWTIMES_URL ||
      'https://japansociety.org/wp-json/events/v1/data?events_categories=9127&limit=120',
    officialSiteUrl:
      process.env.JAPANSOCIETY_OFFICIAL_URL || 'https://japansociety.org/film/',
  },
]

function getRequestedTheaterSlugs(): string[] {
  const requested = process.argv
    .slice(2)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  return [...new Set(requested.flatMap((slug) => THEATER_SLUG_GROUPS[slug] || [slug]))]
}

function normalizeWhitespace(input?: string | null): string {
  return (input || '').replace(/\s+/g, ' ').trim()
}

function isProgramContent(input: {
  title?: string
  overview?: string
}): boolean {
  const t = normalizeWhitespace(input.title).toLowerCase()
  const o = normalizeWhitespace(input.overview).toLowerCase()

  return (
    t.includes('tribute') ||
    t.includes('program') ||
    t.includes('shorts') ||
    t.includes('double feature') ||
    t.includes('episodes') ||
    t.includes('panel') ||
    t.includes('secret screening') ||
    t.includes('members only') ||
    t.includes('award-winning shorts') ||
    t.includes('presents') ||
    o.includes('program of shorts') ||
    o.includes('festival') ||
    o.includes('retrospective') ||
    o.includes('presents a program') ||
    o.includes('as part of') ||
    o.includes('special thanks to')
  )
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function formatLocalTime(date: Date): string {
  return DateTime.fromJSDate(date)
    .setZone(APP_TIMEZONE)
    .toFormat('yyyy-MM-dd HH:mm')
}

function computeEndTime(startTime: Date, runtimeMinutes?: number): Date | undefined {
  if (!runtimeMinutes || runtimeMinutes <= 0) return undefined
  return new Date(startTime.getTime() + runtimeMinutes * 60 * 1000)
}

async function cleanupExpiredShowtimes() {
  const batchSize = 1000
  let totalDeleted = 0

  while (true) {
    const deleted = await deleteExpiredShowtimesBatch(batchSize)
    totalDeleted += deleted
    if (deleted < batchSize) break
  }

  console.log(`[cleanup] Expired showtimes deleted after ingest: ${totalDeleted}`)
}

async function ingestOneTheater(
  config: TheaterIngestConfig
): Promise<TheaterRunStats> {
  const startedAt = Date.now()

  if (!config.sourceUrl) {
    throw new Error(`[${config.theaterSlug}] Missing sourceUrl`)
  }

  console.log(`\n========== Start ingesting ${config.theaterName} ==========`)

  const scraper = getShowtimeScraper(config.theaterSlug)
  const theaterMeta = THEATER_META[config.theaterSlug]

  const theater = await upsertTheater({
    theaterName: config.theaterName,
    theaterSlug: config.theaterSlug,
    sourceName: config.sourceName,
    officialSiteUrl: config.officialSiteUrl,
    address: theaterMeta?.address,
    latitude: theaterMeta?.latitude,
    longitude: theaterMeta?.longitude,
  })

  const scrapeStartedAt = Date.now()
  const scraped = await scraper({
    sourceUrl: config.sourceUrl,
    theaterSlug: config.theaterSlug,
  })
  console.log(
    `[${config.theaterSlug}] Scrape completed in ${Date.now() - scrapeStartedAt}ms`
  )

  console.log(`[${config.theaterSlug}] Scraped ${scraped.length} raw showtimes`)

  const fingerprintsForCancel: string[] = []
  const seenFingerprints = new Set<string>()
  const canonicalLookupAttemptedMovieIds = new Set<number>()

  let parsedCount = 0
  let dedupedCount = 0
  let parseFailedCount = 0
  let upsertedCount = 0

  const processingStartedAt = Date.now()

  for (const item of scraped) {
    const parsedStart = parseStartTime(item.startTimeRaw)

    if (!parsedStart) {
      parseFailedCount += 1
      console.warn(
        `[${config.theaterSlug}] Failed to parse time: ${item.movieTitle} | ${item.startTimeRaw}`
      )
      continue
    }

    parsedCount += 1

    const canonicalTitle = canonicalizeTitle(
      normalizeScreeningMovieTitle(item.movieTitle || item.shownTitle)
    )
    const fallbackMovieTitle =
      canonicalTitle ||
      canonicalizeTitle(normalizeScreeningMovieTitle(item.shownTitle || item.movieTitle))
    const matchedMovieTitle = canonicalizeTitle(
      normalizeScreeningMovieTitle(
        item.matchedMovieTitleHint || item.movieTitle || item.shownTitle
      )
    )
    const formatName = normalizeFormat(item.rawFormat)

    const preFingerprint = buildFingerprint({
      theaterSlug: config.theaterSlug,
      movieTitle: canonicalTitle,
      startTimeUtcIso: parsedStart.toISOString(),
      formatName,
    })

    if (seenFingerprints.has(preFingerprint)) {
      dedupedCount += 1
      console.warn(
        `[${config.theaterSlug}] Duplicate scraped showtime skipped: ${canonicalTitle} | ${formatLocalTime(parsedStart)} | ${formatName}`
      )
      continue
    }

    seenFingerprints.add(preFingerprint)

    const format = await upsertFormat(formatName)

    const isProgram = isProgramContent({
      title: canonicalTitle || item.movieTitle,
      overview: item.overview,
    })

    let movie

    if (isProgram) {
      movie = await upsertLocalMovie({
        title: fallbackMovieTitle,
        releaseYear: item.releaseYear,
        runtimeMinutes: item.runtimeMinutes,
        overview: item.overview,
        posterUrl: item.posterUrl,
        officialSiteUrl: item.sourceUrl,
        directorText: item.directorText,
        genresText: 'Program',
      })
    } else {
      const matchInput = {
        title: fallbackMovieTitle || canonicalTitle || item.movieTitle,
        titleCandidates: item.tmdbTitleCandidates,
        directorText: item.directorText,
        releaseYear: item.releaseYear,
      }
      const existingMovie = await findLocalMovieByImportMatch(matchInput)

      if (existingMovie) {
        const fallbackData = {
          title: matchedMovieTitle || fallbackMovieTitle || existingMovie.title,
          titleCandidates: item.tmdbTitleCandidates,
          directorText: item.directorText,
          releaseYear: item.releaseYear,
          runtimeMinutes: item.runtimeMinutes,
          overview: item.overview,
          posterUrl: item.posterUrl,
          officialSiteUrl: item.sourceUrl,
          genresText: config.theaterName,
          preferTitle: item.preferMovieTitleForDisplay,
        }

        const shouldRetryCanonicalLookup =
          Boolean(TMDB_API_KEY) &&
          !canonicalLookupAttemptedMovieIds.has(existingMovie.id) &&
          shouldAttemptCanonicalTmdbLookup(existingMovie, {
            title: matchInput.title,
            titleCandidates: matchInput.titleCandidates,
            directorText: matchInput.directorText,
            releaseYear: matchInput.releaseYear,
          })

        canonicalLookupAttemptedMovieIds.add(existingMovie.id)

        if (shouldRetryCanonicalLookup) {
          const tmdbMovie = await searchTmdbMovie({
            title: canonicalTitle || item.movieTitle,
            titleCandidates: item.tmdbTitleCandidates,
            directorText: item.directorText,
            releaseYear: item.releaseYear,
            runtimeMinutes: item.runtimeMinutes,
            tmdbApiKey: TMDB_API_KEY,
          })

          if (tmdbMovie.tmdbId) {
            movie = await upsertMovie(tmdbMovie, fallbackData)
          } else {
            movie = (await mergeMovieMetadata(existingMovie.id, fallbackData)) || existingMovie
          }
        } else {
          movie = (await mergeMovieMetadata(existingMovie.id, fallbackData)) || existingMovie
        }
      } else if (TMDB_API_KEY) {
        const tmdbMovie = await searchTmdbMovie({
          title: canonicalTitle || item.movieTitle,
          titleCandidates: item.tmdbTitleCandidates,
          directorText: item.directorText,
          releaseYear: item.releaseYear,
          runtimeMinutes: item.runtimeMinutes,
          tmdbApiKey: TMDB_API_KEY,
        })

        if (tmdbMovie.tmdbId) {
          const tmdbMatchedTitle = canonicalizeTitle(
            tmdbMovie.matchedQueryTitle || matchedMovieTitle || canonicalTitle
          )

          movie = await upsertMovie(tmdbMovie, {
            title: tmdbMatchedTitle,
            directorText: item.directorText,
            releaseYear: item.releaseYear,
            runtimeMinutes: item.runtimeMinutes,
            overview: item.overview,
            posterUrl: item.posterUrl,
            officialSiteUrl: item.sourceUrl,
            genresText: config.theaterName,
            preferTitle: item.preferMovieTitleForDisplay,
          })
        } else {
          movie = await upsertLocalMovie({
            title: fallbackMovieTitle,
            releaseYear: item.releaseYear,
            runtimeMinutes: item.runtimeMinutes,
            overview: item.overview,
            posterUrl: item.posterUrl,
            officialSiteUrl: item.sourceUrl,
            directorText: item.directorText,
            genresText: config.theaterName,
          })
        }
      } else {
        movie = await upsertLocalMovie({
          title: fallbackMovieTitle,
          releaseYear: item.releaseYear,
          runtimeMinutes: item.runtimeMinutes,
          overview: item.overview,
          posterUrl: item.posterUrl,
          officialSiteUrl: item.sourceUrl,
          directorText: item.directorText,
          genresText: config.theaterName,
        })
      }
    }

    const fingerprint = buildFingerprint({
      theaterSlug: config.theaterSlug,
      movieTitle: movie.title,
      startTimeUtcIso: parsedStart.toISOString(),
      formatName,
    })

    const effectiveRuntimeMinutes = item.runtimeMinutes ?? movie.runtimeMinutes ?? undefined
    const endTime = computeEndTime(parsedStart, effectiveRuntimeMinutes)

    fingerprintsForCancel.push(fingerprint)

    await upsertShowtime({
      movieId: movie.id,
      theaterId: theater.id,
      formatId: format.id,
      startTime: parsedStart,
      endTime,
      runtimeMinutes: item.runtimeMinutes,
      ticketUrl: item.ticketUrl,
      shownTitle: item.shownTitle,
      sourceUrl: item.sourceUrl,
      sourceShowtimeId: item.sourceShowtimeId,
      fingerprint,
      sourceName: config.sourceName,
    })

    upsertedCount += 1

    console.log(
      `[${config.theaterSlug}] Upserted: ${movie.title} | ${formatLocalTime(parsedStart)} | ${formatName}`
    )
  }

  console.log(
    `[${config.theaterSlug}] Processing completed in ${Date.now() - processingStartedAt}ms`
  )

  await markMissingShowtimesAsCanceled(theater.id, fingerprintsForCancel)

  const durationMs = Date.now() - startedAt

  console.log(
    `[${config.theaterSlug}] Completed. raw=${scraped.length}, parsed=${parsedCount}, deduped=${dedupedCount}, parseFailed=${parseFailedCount}, upserted=${upsertedCount}, durationMs=${durationMs}`
  )

  return {
    theaterSlug: String(config.theaterSlug),
    theaterName: config.theaterName,
    rawCount: scraped.length,
    parsedCount,
    dedupedCount,
    parseFailedCount,
    upsertedCount,
    success: true,
    durationMs,
  }
}

async function main() {
  const requestedSlugs = getRequestedTheaterSlugs()

  let enabledConfigs = THEATER_CONFIGS.filter((config) => Boolean(config.sourceUrl))

  if (requestedSlugs.length > 0) {
    enabledConfigs = enabledConfigs.filter((config) =>
      requestedSlugs.includes(String(config.theaterSlug).toLowerCase())
    )

    const foundSlugs = enabledConfigs.map((c) =>
      String(c.theaterSlug).toLowerCase()
    )
    const missingSlugs = requestedSlugs.filter((slug) => !foundSlugs.includes(slug))

    if (missingSlugs.length > 0) {
      console.warn(
        `Unknown or unavailable theater slug(s): ${missingSlugs.join(', ')}`
      )
    }
  }

  if (enabledConfigs.length === 0) {
    throw new Error('No valid theater configs found for this run.')
  }

  if (!TMDB_API_KEY) {
    console.warn(
      '[ingest] TMDB_API_KEY is missing. The script will still run, but unmatched titles will be stored as local movies only.'
    )
  }

  console.log(`Preparing to ingest ${enabledConfigs.length} theater(s):`)
  for (const config of enabledConfigs) {
    console.log(`  ${config.theaterSlug}`)
  }

  const results: TheaterRunStats[] = []

  for (const config of enabledConfigs) {
    try {
      const result = await ingestOneTheater(config)
      results.push(result)
    } catch (error) {
      const failedResult: TheaterRunStats = {
        theaterSlug: String(config.theaterSlug),
        theaterName: config.theaterName,
        rawCount: 0,
        parsedCount: 0,
        dedupedCount: 0,
        parseFailedCount: 0,
        upsertedCount: 0,
        success: false,
        durationMs: 0,
        error: toErrorMessage(error),
      }

      results.push(failedResult)
      console.error(`[${config.theaterSlug}] Ingestion failed: ${failedResult.error}`)
    }
  }

  console.log('\n========== Ingest summary ==========')

  for (const result of results) {
    if (result.success) {
      console.log(
        `[${result.theaterSlug}] success | raw=${result.rawCount} | parsed=${result.parsedCount} | deduped=${result.dedupedCount} | parseFailed=${result.parseFailedCount} | upserted=${result.upsertedCount} | durationMs=${result.durationMs}`
      )
    } else {
      console.log(`[${result.theaterSlug}] failed | error=${result.error}`)
    }
  }

  await cleanupExpiredShowtimes()

  const counts = await getIngestTableCounts()

  console.log('\n========== Table totals ==========')
  console.log(
    [
      `Theater=${counts.theaterCount}`,
      `Movie=${counts.movieCount}`,
      `Format=${counts.formatCount}`,
      `Showtime=${counts.showtimeCount}`,
      `ShowtimeScheduled=${counts.scheduledShowtimeCount}`,
      `ShowtimeCanceled=${counts.canceledShowtimeCount}`,
    ].join(' | ')
  )

  const failedCount = results.filter((r) => !r.success).length

  if (failedCount > 0) {
    process.exitCode = 1
    console.error(`\nIngest finished with ${failedCount} failed theater(s).`)
  } else {
    console.log('\nAll theaters ingestion finished successfully.')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectPrisma()
  })
