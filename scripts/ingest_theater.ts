// scripts/ingest_theater.ts

import 'dotenv/config'
import { DateTime } from 'luxon'
import { getShowtimeScraper } from '../lib/ingest/adapters'
import { searchTmdbMovie, canonicalizeTitle } from '../lib/ingest/services/tmdb_service'
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
  theaterSlug: string
  sourceName: string
  sourceUrl: string
  officialSiteUrl?: string
}

const TMDB_API_KEY = process.env.TMDB_API_KEY || ''

// List of all theaters to ingest
// Add new theaters here after implementing their adapters
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
    sourceUrl: process.env.FILMFORUM_SHOWTIMES_URL || 'https://filmforum.org/now_playing',
    officialSiteUrl: process.env.FILMFORUM_OFFICIAL_URL || 'https://filmforum.org',
  },

  {
  theaterName: 'IFC Center',
  theaterSlug: 'ifc',
  sourceName: 'ifc',
  sourceUrl: process.env.IFC_SHOWTIMES_URL || 'https://www.ifccenter.com/',
  officialSiteUrl: process.env.IFC_OFFICIAL_URL || 'https://www.ifccenter.com',
},

  // Example:
  // {
  //   theaterName: 'IFC Center',
  //   theaterSlug: 'ifc',
  //   sourceName: 'ifc',
  //   sourceUrl: process.env.IFC_SHOWTIMES_URL || '',
  //   officialSiteUrl: process.env.IFC_OFFICIAL_URL || '',
  // },
]

const THEATER_META = {
  metrograph: {
    latitude: 40.7182,
    longitude: -73.9902,
    address: '7 Ludlow St, New York, NY',
  },
  filmforum: {
    latitude: 40.7287,
    longitude: -74.0053,
    address: '209 W Houston St, New York, NY',
  },
  ifc: {
  latitude: 40.7301,
  longitude: -74.0002,
  address: '323 6th Ave, New York, NY',
},
}

function getRequestedTheaterSlugs(): string[] {
  return process.argv
    .slice(2)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}


// Normalize whitespace utility (local helper)
function normalizeWhitespace(input?: string | null): string {
  return (input || '').replace(/\s+/g, ' ').trim()
}

// Detect whether a scraped item is a "program" instead of a single film
// Programs should NOT go through TMDB matching
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

// Ingest pipeline for a single theater
async function ingestOneTheater(config: TheaterIngestConfig) {
  if (!config.sourceUrl) {
    console.warn(`[${config.theaterSlug}] Missing sourceUrl, skipping`)
    return
  }

  console.log(`\n========== Start ingesting ${config.theaterName} ==========`)

  // Select correct scraper (adapter) based on theaterSlug
  const scraper = getShowtimeScraper(config.theaterSlug)

  // Ensure theater exists in DB
  const theater = await upsertTheater({
    theaterName: config.theaterName,
    theaterSlug: config.theaterSlug,
    sourceName: config.sourceName,
    sourceUrl: config.sourceUrl,
    officialSiteUrl: config.officialSiteUrl,
  })

  // Scrape raw showtimes
  const scraped = await scraper({
    sourceUrl: config.sourceUrl,
  })

  console.log(`[${config.theaterSlug}] Scraped ${scraped.length} raw showtimes`)

  const fingerprints: string[] = []

  for (const item of scraped) {
    // Parse start time
    const parsedStart = parseStartTime(item.startTimeRaw)
    if (!parsedStart) {
      console.warn(
        `[${config.theaterSlug}] Failed to parse time: ${item.movieTitle} | ${item.startTimeRaw}`
      )
      continue
    }

    // Normalize format
    const formatName = normalizeFormat(item.rawFormat)
    const format = await upsertFormat(formatName)

    // Determine whether this is a program or a standard movie
    const titleForDecision = item.movieTitle
    const programLike = isProgramContent({
      title: titleForDecision,
      overview: item.overview,
    })

    let movie

    // If program-like, skip TMDB and store locally
    if (programLike) {
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
      // Try matching with TMDB
      const tmdbMovie = await searchTmdbMovie({
        title: item.movieTitle,
        directorText: item.directorText,
        releaseYear: item.releaseYear,
        runtimeMinutes: item.runtimeMinutes,
        tmdbApiKey: TMDB_API_KEY,
      })

      if (tmdbMovie.tmdbId) {
        // Use TMDB-enriched data
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
        // Fallback to local movie creation
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

    // Build unique fingerprint for deduplication
    const fingerprint = buildFingerprint({
      theaterSlug: config.theaterSlug,
      movieTitle: movie.title,
      startTimeUtcIso: parsedStart.toISOString(),
      formatName,
    })

    fingerprints.push(fingerprint)

    // Upsert showtime
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
      `[${config.theaterSlug}] Upserted: ${movie.title} | ${DateTime.fromJSDate(parsedStart)
        .setZone(TIMEZONE)
        .toFormat('yyyy-MM-dd HH:mm')} | ${formatName}`
    )
  }

  // Mark missing future showtimes as canceled
  await markMissingShowtimesAsCanceled(theater.id, fingerprints)

  console.log(`[${config.theaterSlug}] Ingestion completed`)
}

// Main entry: ingest all configured theaters
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