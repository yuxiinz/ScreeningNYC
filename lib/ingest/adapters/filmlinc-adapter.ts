import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchJson } from '@/lib/http/server-fetch'
import { parseRuntimeMinutes } from '../core/meta'
import { parseScreeningTitle } from '../core/screening-title'
import {
  cleanText,
  decodeHtmlEntities,
  getUniqueStrings,
  normalizeComparableText as normalizeComparableTextValue,
} from '../core/text'
import { buildAbsoluteUrl } from '../core/url'
import { FREE_TICKET_SENTINEL } from '../../showtime/ticket'

const FLC_BASE_URL = 'https://www.filmlinc.org'
const DEFAULT_FLC_SHOWTIMES_URL = 'https://api.filmlinc.org/showtimes'
const DEFAULT_FLC_GRAPHQL_URL = 'https://api.filmlinc.org/wordpress/graphql'

const API_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
}

const GRAPHQL_HEADERS = {
  ...API_HEADERS,
  'Content-Type': 'application/json',
}

const FLC_FILM_DETAIL_QUERY = `
  query FlcFilm($id: ID!) {
    contentNode(id: $id, idType: URI) {
      ... on Film {
        title
        slug
        uri
        excerpt
        featuredImage {
          node {
            sourceUrl
            altText
          }
        }
        filmDetails {
          language
          runningTime
          year
          directors {
            name
          }
        }
      }
    }
  }
`

export const FLC_ALLOWED_VENUES = [
  'Walter Reade Theater',
  'Francesca Beale Theater',
  'Amphitheater',
  'Alice Tully Hall',
] as const

type FlcApiShowtime = {
  id?: string | number
  productionSeasonId?: string | number
  date?: string
  time?: string
  dateTimeET?: string
  venue?: string
  ticketsUrl?: string
  freeEvent?: boolean
}

export type FlcApiFilm = {
  id?: string | number
  title?: string
  slug?: string
  showtimes?: FlcApiShowtime[] | null
}

type FlcShowtimesApiResponse = {
  films?: FlcApiFilm[] | null
}

type FlcFilmDirector = {
  name?: string
}

type FlcFilmDetail = {
  title?: string
  slug?: string
  uri?: string
  excerpt?: string
  featuredImage?: {
    node?: {
      sourceUrl?: string
      altText?: string
    } | null
  } | null
  filmDetails?: {
    language?: string
    runningTime?: string
    year?: string
    directors?: FlcFilmDirector[] | null
  } | null
}

type FlcGraphQlResponse = {
  data?: {
    contentNode?: FlcFilmDetail | null
  } | null
  errors?: Array<{
    message?: string
  }>
}

type FlcTitleFields = {
  shownTitle?: string
  movieTitle: string
  rawFormat?: string
  releaseYear?: number
  tmdbTitleCandidates?: string[]
  preferMovieTitleForDisplay?: boolean
  matchedMovieTitleHint?: string
}

function textOf(value?: string | number | null): string {
  return cleanText(decodeHtmlEntities(value == null ? '' : String(value)))
}

function htmlToText(value?: string | null): string | undefined {
  const cleaned = cleanText(
    decodeHtmlEntities(value)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
  )

  return cleaned || undefined
}

const normalizeComparableText = (value?: string | null) =>
  normalizeComparableTextValue(textOf(value))

const uniqueStrings = (values: Array<string | undefined>) =>
  getUniqueStrings(values, textOf, normalizeComparableText)

function parseFlcRuntimeMinutes(value?: string | null): number | undefined {
  const cleaned = textOf(value)
  if (!cleaned) return undefined

  if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
    const numeric = Number(cleaned)
    return Number.isFinite(numeric) ? Math.round(numeric) : undefined
  }

  return parseRuntimeMinutes(cleaned)
}

function parseFlcReleaseYear(value?: string | null): number | undefined {
  const cleaned = textOf(value)
  if (!/^(18|19|20)\d{2}$/.test(cleaned)) {
    return undefined
  }

  return Number(cleaned)
}

function joinDirectors(directors?: FlcFilmDirector[] | null): string | undefined {
  return uniqueStrings((directors || []).map((item) => textOf(item?.name)))?.join(', ')
}

function buildFlcSourceUrl(uri?: string | null, slug?: string | null): string | undefined {
  return buildAbsoluteUrl(FLC_BASE_URL, uri || (slug ? `/films/${slug}/` : undefined))
}

function buildFallbackShowtimeId(input: {
  showtimeId?: string | number
  productionSeasonId?: string | number
  slug?: string
  startTimeRaw?: string
}): string | undefined {
  const showtimeId = textOf(input.showtimeId)
  if (showtimeId) return showtimeId

  const productionSeasonId = textOf(input.productionSeasonId)
  const slug = textOf(input.slug)
  const startTimeRaw = textOf(input.startTimeRaw)

  if (!productionSeasonId || !slug || !startTimeRaw) {
    return undefined
  }

  return `${productionSeasonId}:${slug}:${startTimeRaw}`
}

export function isAllowedFlcVenue(value?: string | null): boolean {
  const venue = textOf(value)
  return FLC_ALLOWED_VENUES.includes(venue as (typeof FLC_ALLOWED_VENUES)[number])
}

export function resolveFlcTitleFields(input: {
  apiTitle?: string | null
  canonicalTitle?: string | null
}): FlcTitleFields {
  const shownTitle = textOf(input.apiTitle)
  const canonicalTitle = textOf(input.canonicalTitle)
  const shownTitleParse = parseScreeningTitle(shownTitle || canonicalTitle)
  const canonicalTitleParse = canonicalTitle
    ? parseScreeningTitle(canonicalTitle)
    : undefined

  const movieTitle =
    textOf(canonicalTitleParse?.title) ||
    textOf(shownTitleParse.title) ||
    canonicalTitle ||
    shownTitle

  const distinctShownTitle =
    shownTitle &&
    normalizeComparableText(shownTitle) !== normalizeComparableText(movieTitle)
      ? shownTitle
      : undefined

  const preferMovieTitleForDisplay =
    Boolean(distinctShownTitle)

  const tmdbTitleCandidates = uniqueStrings([
    shownTitle,
    canonicalTitle,
    ...(shownTitleParse.tmdbTitleCandidates || []),
    ...(canonicalTitleParse?.tmdbTitleCandidates || []),
  ])?.filter(
    (candidate) =>
      normalizeComparableText(candidate) !== normalizeComparableText(movieTitle)
  )

  return {
    movieTitle,
    shownTitle: distinctShownTitle,
    rawFormat: shownTitleParse.rawFormat || canonicalTitleParse?.rawFormat,
    releaseYear:
      canonicalTitleParse?.releaseYear ?? shownTitleParse.releaseYear ?? undefined,
    tmdbTitleCandidates: tmdbTitleCandidates?.length ? tmdbTitleCandidates : undefined,
    preferMovieTitleForDisplay: preferMovieTitleForDisplay || undefined,
    matchedMovieTitleHint: preferMovieTitleForDisplay ? movieTitle : undefined,
  }
}

export function mapFlcApiFilmToShowtimes(
  film: FlcApiFilm,
  detail?: FlcFilmDetail | null
): ScrapedShowtime[] {
  const titleFields = resolveFlcTitleFields({
    apiTitle: film.title,
    canonicalTitle: detail?.title,
  })

  if (!titleFields.movieTitle) {
    return []
  }

  const sourceUrl = buildFlcSourceUrl(detail?.uri, film.slug)
  const directorText = joinDirectors(detail?.filmDetails?.directors)
  const releaseYear =
    parseFlcReleaseYear(detail?.filmDetails?.year) ?? titleFields.releaseYear
  const runtimeMinutes = parseFlcRuntimeMinutes(detail?.filmDetails?.runningTime)
  const overview = htmlToText(detail?.excerpt)
  const posterUrl = buildAbsoluteUrl(
    FLC_BASE_URL,
    detail?.featuredImage?.node?.sourceUrl
  )

  return (film.showtimes || []).flatMap((showtime) => {
    if (!isAllowedFlcVenue(showtime.venue)) {
      return []
    }

    const startTimeRaw =
      textOf(showtime.dateTimeET) ||
      cleanText(`${textOf(showtime.date)} ${textOf(showtime.time)}`)

    if (!startTimeRaw) {
      return []
    }

    const ticketUrl = showtime.freeEvent
      ? FREE_TICKET_SENTINEL
      : buildAbsoluteUrl(FLC_BASE_URL, showtime.ticketsUrl)

    return [
      {
        movieTitle: titleFields.movieTitle,
        shownTitle: titleFields.shownTitle,
        startTimeRaw,
        ticketUrl,
        sourceUrl,
        rawFormat: titleFields.rawFormat,
        sourceShowtimeId: buildFallbackShowtimeId({
          showtimeId: showtime.id,
          productionSeasonId: showtime.productionSeasonId,
          slug: film.slug,
          startTimeRaw,
        }),
        directorText,
        releaseYear,
        runtimeMinutes,
        overview,
        posterUrl,
        tmdbTitleCandidates: titleFields.tmdbTitleCandidates,
        preferMovieTitleForDisplay: titleFields.preferMovieTitleForDisplay,
        matchedMovieTitleHint: titleFields.matchedMovieTitleHint,
      },
    ]
  })
}

async function fetchFlcShowtimes(apiUrl: string): Promise<FlcApiFilm[]> {
  const response = await fetchJson<FlcShowtimesApiResponse>(apiUrl, {
    timeout: 20000,
    headers: API_HEADERS,
  })

  return Array.isArray(response.data?.films) ? response.data.films : []
}

async function fetchFlcFilmDetail(slug: string): Promise<FlcFilmDetail | null> {
  const cleanedSlug = textOf(slug)
  if (!cleanedSlug) return null

  try {
    const response = await fetchJson<FlcGraphQlResponse>(
      process.env.FLC_GRAPHQL_URL || DEFAULT_FLC_GRAPHQL_URL,
      {
        jsonBody: {
          query: FLC_FILM_DETAIL_QUERY,
          variables: {
            id: `/films/${cleanedSlug}/`,
          },
        },
        timeout: 20000,
        headers: GRAPHQL_HEADERS,
      }
    )

    const detail = response.data?.data?.contentNode
    return detail || null
  } catch (error) {
    console.error(`[flc] detail fetch failed for slug "${cleanedSlug}":`, error)
    return null
  }
}

export async function scrapeFlcShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const films = await fetchFlcShowtimes(
    cleanText(config.sourceUrl) || DEFAULT_FLC_SHOWTIMES_URL
  )

  const eligibleFilms = films.filter((film) =>
    (film.showtimes || []).some((showtime) => isAllowedFlcVenue(showtime.venue))
  )

  const uniqueSlugs = uniqueStrings(eligibleFilms.map((film) => textOf(film.slug))) || []
  const detailEntries = await Promise.all(
    uniqueSlugs.map(async (slug) => [slug, await fetchFlcFilmDetail(slug)] as const)
  )
  const detailsBySlug = new Map<string, FlcFilmDetail | null>(detailEntries)

  const rows = eligibleFilms.flatMap((film) =>
    mapFlcApiFilmToShowtimes(film, film.slug ? detailsBySlug.get(film.slug) : null)
  )

  console.log(
    `[flc] films parsed: ${films.length}; eligible films: ${eligibleFilms.length}; detail lookups: ${uniqueSlugs.length}; output rows: ${rows.length}`
  )

  return rows
}
