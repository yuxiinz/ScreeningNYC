// scripts/ingest_theater.ts

import 'dotenv/config'
import { DateTime } from 'luxon'
import { getShowtimeScraper } from '../lib/ingest/adapters'
import { THEATER_META } from '../lib/ingest/config/theater_meta'
import { APP_TIMEZONE } from '../lib/timezone'
import {
  searchTmdbMovie,
  canonicalizeTitle,
} from '../lib/ingest/services/tmdb_service'
import {
  upsertTheater,
  upsertFormat,
  upsertMovie,
  upsertLocalMovie,
  upsertShowtime,
  markMissingShowtimesAsCanceled,
  normalizeFormat,
  parseStartTime,
  buildFingerprint,
  disconnectPrisma,
} from '../lib/ingest/services/persist_service'

type KnownTheaterSlug = keyof typeof THEATER_META
type TheaterSlug = KnownTheaterSlug | string

type TheaterIngestConfig = {
  theaterName: string
  theaterSlug: TheaterSlug
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
    theaterName: 'MoMA',
    theaterSlug: 'moma',
    sourceName: 'moma',
    sourceUrl:
      process.env.MOMA_SHOWTIMES_URL ||
      'https://www.moma.org/calendar/?happening_filter=Films&locale=en&location=both',
    officialSiteUrl: process.env.MOMA_OFFICIAL_URL || 'https://www.moma.org',
  },
]

function getRequestedTheaterSlugs(): string[] {
  return process.argv
    .slice(2)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
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

async function ingestOneTheater(
  config: TheaterIngestConfig
): Promise<TheaterRunStats> {
  const startedAt = Date.now()

  if (!config.sourceUrl) {
    throw new Error(`[${config.theaterSlug}] Missing sourceUrl`)
  }

  console.log(`\n========== Start ingesting ${config.theaterName} ==========`)

  const scraper = getShowtimeScraper(config.theaterSlug)

  const theaterMeta =
    config.theaterSlug in THEATER_META
      ? THEATER_META[config.theaterSlug as KnownTheaterSlug]
      : undefined

  if (!theaterMeta) {
    console.warn(
      `[${config.theaterSlug}] Missing theater meta, address and coordinates may be empty`
    )
  }

  const theater = await upsertTheater({
    theaterName: config.theaterName,
    theaterSlug: config.theaterSlug,
    sourceName: config.sourceName,
    officialSiteUrl: config.officialSiteUrl,
    address: theaterMeta?.address,
    latitude: theaterMeta?.latitude,
    longitude: theaterMeta?.longitude,
  })

  const scraped = await scraper({
    sourceUrl: config.sourceUrl,
    theaterSlug: config.theaterSlug,
  })

  console.log(`[${config.theaterSlug}] Scraped ${scraped.length} raw showtimes`)

  const fingerprintsForCancel: string[] = []
  const seenFingerprints = new Set<string>()

  let parsedCount = 0
  let dedupedCount = 0
  let parseFailedCount = 0
  let upsertedCount = 0

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

    const canonicalTitle = canonicalizeTitle(item.movieTitle)
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
      title: item.movieTitle,
      overview: item.overview,
    })

    let movie

    if (isProgram) {
      movie = await upsertLocalMovie({
        title: canonicalTitle,
        releaseYear: item.releaseYear,
        runtimeMinutes: item.runtimeMinutes,
        overview: item.overview,
        posterUrl: item.posterUrl,
        officialSiteUrl: item.sourceUrl,
        directorText: item.directorText,
        genresText: 'Program',
      })
    } else if (TMDB_API_KEY) {
      const tmdbMovie = await searchTmdbMovie({
        title: item.movieTitle,
        directorText: item.directorText,
        releaseYear: item.releaseYear,
        runtimeMinutes: item.runtimeMinutes,
        tmdbApiKey: TMDB_API_KEY,
      })

      if (tmdbMovie.tmdbId) {
        movie = await upsertMovie(tmdbMovie, {
          title: canonicalTitle,
          directorText: item.directorText,
          releaseYear: item.releaseYear,
          runtimeMinutes: item.runtimeMinutes,
          overview: item.overview,
          posterUrl: item.posterUrl,
          officialSiteUrl: item.sourceUrl,
          genresText: config.theaterName,
        })
      } else {
        movie = await upsertLocalMovie({
          title: canonicalTitle,
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
        title: canonicalTitle,
        releaseYear: item.releaseYear,
        runtimeMinutes: item.runtimeMinutes,
        overview: item.overview,
        posterUrl: item.posterUrl,
        officialSiteUrl: item.sourceUrl,
        directorText: item.directorText,
        genresText: config.theaterName,
      })
    }

    const fingerprint = buildFingerprint({
      theaterSlug: config.theaterSlug,
      movieTitle: movie.title,
      startTimeUtcIso: parsedStart.toISOString(),
      formatName,
    })

    fingerprintsForCancel.push(fingerprint)

    await upsertShowtime({
      movieId: movie.id,
      theaterId: theater.id,
      formatId: format.id,
      startTime: parsedStart,
      runtimeMinutes: item.runtimeMinutes,
      ticketUrl: item.ticketUrl,
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
