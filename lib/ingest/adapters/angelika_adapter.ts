import axios from 'axios'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { parseFormat, parseRuntimeMinutes, parseYear } from '../core/meta'
import { parseScreeningTitle } from '../core/screening_title'
import { cleanText, decodeHtmlEntities, normalizeWhitespace } from '../core/text'
import { buildAbsoluteUrl } from '../core/url'

const ANGELIKA_SITE_BASE_URL = 'https://angelikafilmcenter.com'
const ANGELIKA_API_BASE_URL = 'https://production-api.readingcinemas.com'
const ANGELIKA_COUNTRY_ID = '6'

const API_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
}

const ANGELIKA_THEATERS = {
  angelikanyc: {
    cinemaId: '0000000005',
    alias: 'nyc',
    nowPlayingUrl: 'https://angelikafilmcenter.com/nyc/now-playing',
  },
  angelikaev: {
    cinemaId: '0000000004',
    alias: 'villageeast',
    nowPlayingUrl: 'https://angelikafilmcenter.com/villageeast/now-playing',
  },
  angelika123: {
    cinemaId: '21',
    alias: 'cinemas123',
    nowPlayingUrl: 'https://angelikafilmcenter.com/cinemas123/now-playing',
  },
} as const

type AngelikaShowtime = {
  id?: string
  ScheduledFilmId?: string
  date_time?: string
  soldout?: boolean
  statusCode?: string
}

type AngelikaShowType = {
  type?: string
  showtimes?: AngelikaShowtime[]
}

type AngelikaMovie = {
  name?: string
  synopsis?: string
  poster_image?: string
  moviePoster?: string
  film_image_original_size?: string
  director?: string
  release_date?: string
  length?: string | number
  movieSlug?: string
  showdates?: Array<{
    showtypes?: AngelikaShowType[]
  }>
}

type AngelikaSettingsResponse = {
  data?: {
    settings?: {
      token?: string
    }
  }
}

type AngelikaNowShowingResponse = {
  nowShowing?: {
    statusCode?: number
    data?: {
      movies?: AngelikaMovie[]
    }
  }
}

let cachedAccessToken:
  | {
      token: string
      expiresAt: number
    }
  | undefined

function getTheaterConfig(theaterSlug: string) {
  const theater =
    ANGELIKA_THEATERS[
      theaterSlug.toLowerCase() as keyof typeof ANGELIKA_THEATERS
    ]

  if (!theater) {
    throw new Error(`Unsupported Angelika theater slug: ${theaterSlug}`)
  }

  return theater
}

function parseJwtExpiry(token: string): number | undefined {
  try {
    const payload = token.split('.')[1]
    if (!payload) return undefined

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'))

    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : undefined
  } catch {
    return undefined
  }
}

async function getAngelikaAccessToken(): Promise<string> {
  const now = Date.now()

  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
    return cachedAccessToken.token
  }

  const response = await axios.get<AngelikaSettingsResponse>(
    `${ANGELIKA_API_BASE_URL}/settings/${ANGELIKA_COUNTRY_ID}`,
    {
      timeout: 20000,
      headers: API_HEADERS,
    }
  )

  const token = response.data?.data?.settings?.token
  if (!token) {
    throw new Error('Angelika settings response missing access token')
  }

  cachedAccessToken = {
    token,
    expiresAt: parseJwtExpiry(token) || now + 30 * 60_000,
  }

  return token
}

function cleanHtmlToText(value?: string | null): string | undefined {
  const decoded = decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')

  const cleaned = cleanText(decoded)
  return cleaned || undefined
}

function parseReleaseYear(value?: string | null): number | undefined {
  const year = parseYear(value)
  return year || undefined
}

function parseRuntime(value?: string | number | null): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value)
  }

  const asNumber = Number(value)
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.round(asNumber)
  }

  return parseRuntimeMinutes(String(value || ''))
}

function getPosterUrl(movie: AngelikaMovie): string | undefined {
  return (
    normalizeWhitespace(movie.poster_image) ||
    normalizeWhitespace(movie.moviePoster) ||
    normalizeWhitespace(movie.film_image_original_size) ||
    undefined
  )
}

function buildMovieSourceUrl(alias: string, movieSlug?: string): string | undefined {
  const slug = cleanText(movieSlug)
  if (!slug) return undefined

  return buildAbsoluteUrl(
    ANGELIKA_SITE_BASE_URL,
    `/${alias}/movies/details/${slug}`
  )
}

function buildShowtimeTicketUrl(params: {
  alias: string
  sessionId?: string
  scheduledFilmId?: string
  soldout?: boolean
  statusCode?: string
}): string | undefined {
  if (
    !params.sessionId ||
    !params.scheduledFilmId ||
    params.soldout ||
    params.statusCode === '1'
  ) {
    return undefined
  }

  return buildAbsoluteUrl(
    ANGELIKA_SITE_BASE_URL,
    `/${params.alias}/sessions/${params.sessionId}/${params.scheduledFilmId}`
  )
}

function buildScrapedRows(
  movies: AngelikaMovie[],
  theater: (typeof ANGELIKA_THEATERS)[keyof typeof ANGELIKA_THEATERS],
  fallbackNowPlayingUrl?: string
): ScrapedShowtime[] {
  const rows: ScrapedShowtime[] = []

  for (const movie of movies) {
    const titleParse = parseScreeningTitle(movie.name)
    const overview = cleanHtmlToText(movie.synopsis)
    const runtimeMinutes = parseRuntime(movie.length)
    const releaseYear = titleParse.releaseYear || parseReleaseYear(movie.release_date)
    const directorText = cleanText(movie.director) || undefined
    const posterUrl = getPosterUrl(movie)
    const shownTitle = cleanText(movie.name) || titleParse.title
    const sourceUrl =
      buildMovieSourceUrl(theater.alias, movie.movieSlug) ||
      cleanText(fallbackNowPlayingUrl) ||
      theater.nowPlayingUrl

    for (const showdate of movie.showdates || []) {
      for (const showtype of showdate.showtypes || []) {
        const rawShowtype = cleanText(showtype.type)
        const rawFormat = titleParse.rawFormat || parseFormat(rawShowtype)

        for (const showtime of showtype.showtimes || []) {
          if (!showtime.id || !showtime.date_time) continue

          rows.push({
            movieTitle: titleParse.title || cleanText(movie.name),
            shownTitle,
            startTimeRaw: showtime.date_time,
            ticketUrl: buildShowtimeTicketUrl({
              alias: theater.alias,
              sessionId: showtime.id,
              scheduledFilmId: showtime.ScheduledFilmId,
              soldout: showtime.soldout,
              statusCode: showtime.statusCode,
            }),
            sourceUrl,
            rawFormat,
            sourceShowtimeId: showtime.id,
            directorText,
            releaseYear,
            runtimeMinutes,
            overview,
            posterUrl,
            tmdbTitleCandidates: titleParse.tmdbTitleCandidates,
            preferMovieTitleForDisplay: titleParse.preferMovieTitleForDisplay,
          })
        }
      }
    }
  }

  return rows
}

export async function scrapeAngelikaShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const theater = getTheaterConfig(config.theaterSlug)
  const token = await getAngelikaAccessToken()

  const response = await axios.get<AngelikaNowShowingResponse>(
    `${ANGELIKA_API_BASE_URL}/films`,
    {
      timeout: 30000,
      headers: {
        ...API_HEADERS,
        Authorization: `Bearer ${token}`,
      },
      params: {
        countryId: ANGELIKA_COUNTRY_ID,
        cinemaId: theater.cinemaId,
        status: 'getShows',
        flag: 'nowshowing',
      },
    }
  )

  const movies = response.data?.nowShowing?.data?.movies || []

  return buildScrapedRows(movies, theater, config.sourceUrl)
}
