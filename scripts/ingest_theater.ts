// scripts/ingest_theater.ts

import 'dotenv/config'
import { DateTime } from 'luxon'
import { getShowtimeScraper } from '../lib/ingest/adapters'
import { THEATER_META } from '../lib/ingest/config/theater_meta'
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

const TIMEZONE = 'America/New_York'

type TheaterIngestConfig = {
  theaterName: string
  theaterSlug: keyof typeof THEATER_META | string
  sourceName: string
  sourceUrl: string
  officialSiteUrl?: string
}

const TMDB_API_KEY = process.env.TMDB_API_KEY || ''

const THEATER_CONFIGS: TheaterIngestConfig[] = [
  {
    theaterName: 'Metrograph',
    theaterSlug: 'metrograph',
    sourceName: 'metrograph',
    sourceUrl: process.env.METROGRAPH_SHOWTIMES_URL || '',
    officialSiteUrl: process.env.METROGRAPH_OFFICIAL_URL || '',
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

async function ingestOneTheater(config: TheaterIngestConfig) {
  if (!config.sourceUrl) {
    console.warn(`[${config.theaterSlug}] Missing sourceUrl, skipping`)
    return
  }

  console.log(`\n========== Start ingesting ${config.theaterName} ==========`)

  const scraper = getShowtimeScraper(config.theaterSlug)
  const theaterMeta =
    config.theaterSlug in THEATER_META
      ? THEATER_META[config.theaterSlug as keyof typeof THEATER_META]
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
    sourceUrl: config.sourceUrl,
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

  const fingerprints: string[] = []

  for (const item of scraped) {
    const parsedStart = parseStartTime(item.startTimeRaw)
    if (!parsedStart) {
      console.warn(
        `[${config.theaterSlug}] Failed to parse time: ${item.movieTitle} | ${item.startTimeRaw}`
      )
      continue
    }

    const formatName = normalizeFormat(item.rawFormat)
    const format = await upsertFormat(formatName)

    const titleForDecision = item.movieTitle
    const isProgram = isProgramContent({
      title: titleForDecision,
      overview: item.overview,
    })

    let movie

    if (isProgram) {
      movie = await upsertLocalMovie({
        title: canonicalizeTitle(titleForDecision),
        releaseYear: item.releaseYear,
        runtimeMinutes: item.runtimeMinutes,
        overview: item.overview,
        posterUrl: item.posterUrl,
        officialSiteUrl: item.sourceUrl,
        directorText: item.directorText,
        genresText: 'Program',
      })
    } else {
      const tmdbMovie = await searchTmdbMovie({
        title: item.movieTitle,
        directorText: item.directorText,
        releaseYear: item.releaseYear,
        runtimeMinutes: item.runtimeMinutes,
        tmdbApiKey: TMDB_API_KEY,
      })

      if (tmdbMovie.tmdbId) {
        movie = await upsertMovie(tmdbMovie, {
          title: canonicalizeTitle(titleForDecision),
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
          title: canonicalizeTitle(titleForDecision),
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

    fingerprints.push(fingerprint)

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

    console.log(
      `[${config.theaterSlug}] Upserted: ${movie.title} | ${DateTime.fromJSDate(
        parsedStart
      )
        .setZone(TIMEZONE)
        .toFormat('yyyy-MM-dd HH:mm')} | ${formatName}`
    )
  }

  await markMissingShowtimesAsCanceled(theater.id, fingerprints)

  console.log(`[${config.theaterSlug}] Ingestion completed`)
}

async function main() {
  const requestedSlugs = getRequestedTheaterSlugs()

  let enabledConfigs = THEATER_CONFIGS.filter((config) => config.sourceUrl)

  if (requestedSlugs.length > 0) {
    enabledConfigs = enabledConfigs.filter((config) =>
      requestedSlugs.includes(config.theaterSlug.toLowerCase())
    )

    const foundSlugs = enabledConfigs.map((c) => c.theaterSlug)
    const missingSlugs = requestedSlugs.filter((slug) => !foundSlugs.includes(slug))

    if (missingSlugs.length > 0) {
      console.warn(`Unknown or unavailable theater slug(s): ${missingSlugs.join(', ')}`)
    }
  }

  if (enabledConfigs.length === 0) {
    throw new Error('No valid theater configs found for this run.')
  }

  console.log(`Preparing to ingest ${enabledConfigs.length} theater(s):`)
  for (const config of enabledConfigs) {
    console.log(`  ${config.theaterSlug}`)
  }

  for (const config of enabledConfigs) {
    try {
      await ingestOneTheater(config)
    } catch (error) {
      console.error(`[${config.theaterSlug}] Ingestion failed`, error)
    }
  }

  console.log('\nAll theaters ingestion finished')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectPrisma()
  })