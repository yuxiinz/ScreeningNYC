import * as cheerio from 'cheerio'
import { DateTime } from 'luxon'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { fetchJson } from '@/lib/http/server-fetch'
import { parseFormat, parseRuntimeMinutes, parseYear } from '../core/meta'
import { parseScreeningTitle } from '../core/screening-title'
import { buildAbsoluteUrl } from '../core/url'
import { cleanText, decodeHtmlEntities, normalizeWhitespace } from '../core/text'
import { APP_TIMEZONE } from '../../timezone'

const API_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'application/json,text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

const SHOWTIME_PAGE_SIZE = 100
const SHOWTIME_MAX_PAGES = 200
const SHOW_CHUNK_SIZE = 100
const SERIES_DETAIL_MAX = 200

const NITEHAWK_THEATERS = {
  nitehawkwilliamsburg: {
    homeUrl: 'https://nitehawkcinema.com/williamsburg/',
    seriesLandingUrl: 'https://nitehawkcinema.com/williamsburg/film-series/',
  },
  nitehawkprospectpark: {
    homeUrl: 'https://nitehawkcinema.com/prospectpark/',
    seriesLandingUrl: 'https://nitehawkcinema.com/prospectpark/film-series-2/',
  },
} as const

type NitehawkTitleField = {
  raw?: string
  rendered?: string
}

type NitehawkContentField = {
  raw?: string
  rendered?: string
}

type NitehawkTerm = {
  name?: string
}

type NitehawkShowtime = {
  id?: number | string
  title?: NitehawkTitleField
  _datetime?: string | number
  _ticketing_url?: string
  _sold_out?: string
  _open_captions?: string
  showtime_to_show?: number[]
  showtime_to_auditorium?: number[]
  showtime_to_ticket_type?: number[]
  _length?: string
  link?: string
}

type NitehawkShow = {
  id?: number
  link?: string
  slug?: string
  title?: NitehawkTitleField
  content?: NitehawkContentField
  excerpt?: NitehawkContentField
  featured_media_url?: string
  _movie_still?: string
  _release_date?: string
  _length?: string
  director?: NitehawkTerm[]
  format?: NitehawkTerm[]
}

function getTheaterConfig(theaterSlug: string) {
  const theater =
    NITEHAWK_THEATERS[
      theaterSlug.toLowerCase() as keyof typeof NITEHAWK_THEATERS
    ]

  if (!theater) {
    throw new Error(`Unsupported Nitehawk theater slug: ${theaterSlug}`)
  }

  return theater
}

function buildApiUrl(
  homeUrl: string,
  endpoint: string,
  params?: Record<string, string | number | Array<string | number>>
): string {
  const base = buildAbsoluteUrl(homeUrl, `wp-json/nj/v1/${endpoint}`)
  if (!base) {
    throw new Error(`Failed to build Nitehawk API URL for endpoint: ${endpoint}`)
  }

  if (!params) return base

  const url = new URL(base)

  for (const [key, rawValue] of Object.entries(params)) {
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        url.searchParams.append(key, String(value))
      }
      continue
    }

    url.searchParams.set(key, String(rawValue))
  }

  return url.toString()
}

function cleanHtmlToText(value?: string | null): string | undefined {
  const decoded = decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')

  const cleaned = cleanText(decoded)
  return cleaned || undefined
}

function toNumber(value?: string | number | null): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

function parseRuntime(value?: string | number | null): number | undefined {
  const num = toNumber(value)
  if (num && num > 0) return Math.round(num)

  return parseRuntimeMinutes(String(value || ''))
}

function isSoldOut(value?: string | null): boolean {
  const s = cleanText(value).toLowerCase()
  if (!s) return false

  return s === 'on' || s === '1' || s === 'true' || s === 'yes' || s === 'sold out'
}

function toCanonicalUrl(url?: string | null): string {
  const cleaned = cleanText(url)
  if (!cleaned) return ''

  try {
    const parsed = new URL(cleaned)
    parsed.hash = ''
    parsed.search = ''
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return cleaned.replace(/[#?].*$/, '').replace(/\/+$/, '')
  }
}

function formatEpochToStartTimeRaw(epochSeconds: number): string {
  return DateTime.fromSeconds(epochSeconds, { zone: APP_TIMEZONE }).toFormat(
    'EEEE MMMM d yyyy h:mm a'
  )
}

function parseEpochToDateLabel(epochSeconds: number): string {
  return DateTime.fromSeconds(epochSeconds, { zone: APP_TIMEZONE }).toFormat(
    'MMMM d, yyyy'
  )
}

function parseShowId(showtime: NitehawkShowtime): number | undefined {
  const id = showtime.showtime_to_show?.[0]
  return Number.isFinite(id) ? id : undefined
}

function parseShowtimeId(showtime: NitehawkShowtime): string | undefined {
  const id = toNumber(showtime.id)
  if (!id) return undefined
  return String(Math.trunc(id))
}

function parseTitle(value?: NitehawkTitleField): string {
  return cleanText(decodeHtmlEntities(value?.raw || value?.rendered))
}

function parseDirectorText(directors?: NitehawkTerm[]): string | undefined {
  const names = (directors || [])
    .map((director) => cleanText(decodeHtmlEntities(director?.name)))
    .filter(Boolean)

  if (!names.length) return undefined
  return names.join(', ')
}

function parseFormatFromShow(show?: NitehawkShow): string | undefined {
  for (const term of show?.format || []) {
    const raw = cleanText(term?.name)
    if (!raw) continue

    return parseFormat(raw) || raw
  }

  return undefined
}

function buildTicketUrl(params: {
  homeUrl: string
  showtime: NitehawkShowtime
}): string | undefined {
  if (isSoldOut(params.showtime._sold_out)) {
    return undefined
  }

  const external = cleanText(params.showtime._ticketing_url)
  if (external) {
    return buildAbsoluteUrl(params.homeUrl, external)
  }

  const showtimeId = parseShowtimeId(params.showtime)
  if (!showtimeId) return undefined

  return buildAbsoluteUrl(params.homeUrl, `purchase/${showtimeId}/`)
}

async function fetchFutureShowtimes(
  homeUrl: string,
  nowEpochSeconds: number
): Promise<NitehawkShowtime[]> {
  const rows: NitehawkShowtime[] = []
  const seenIds = new Set<string>()
  const seenPageSignatures = new Set<string>()

  for (let page = 1; page <= SHOWTIME_MAX_PAGES; page += 1) {
    const url = buildApiUrl(homeUrl, 'showtime', {
      meta_key: '_datetime',
      meta_compare: '>=',
      meta_value: String(nowEpochSeconds),
      orderby: '_datetime',
      order: 'asc',
      per_page: SHOWTIME_PAGE_SIZE,
      page,
    })

    const response = await fetchJson<NitehawkShowtime[]>(url, {
      timeout: 30000,
      headers: API_HEADERS,
    })

    const pageRows = Array.isArray(response.data) ? response.data : []
    if (!pageRows.length) {
      break
    }

    const pageSignature = `${pageRows.length}:${String(pageRows[0]?.id || '')}:${String(
      pageRows[pageRows.length - 1]?.id || ''
    )}`

    if (seenPageSignatures.has(pageSignature)) {
      break
    }

    seenPageSignatures.add(pageSignature)

    for (const row of pageRows) {
      const showtimeId = parseShowtimeId(row)
      if (!showtimeId || seenIds.has(showtimeId)) continue

      seenIds.add(showtimeId)
      rows.push(row)
    }

    if (pageRows.length < SHOWTIME_PAGE_SIZE) {
      break
    }
  }

  return rows
}

async function fetchShowsByIds(
  homeUrl: string,
  ids: number[]
): Promise<Map<number, NitehawkShow>> {
  const result = new Map<number, NitehawkShow>()

  for (let i = 0; i < ids.length; i += SHOW_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + SHOW_CHUNK_SIZE)
    if (!chunk.length) continue

    const url = buildApiUrl(homeUrl, 'show', {
      per_page: SHOW_CHUNK_SIZE,
      'include[]': chunk,
    })

    const response = await fetchJson<NitehawkShow[]>(url, {
      timeout: 30000,
      headers: API_HEADERS,
    })

    for (const show of response.data || []) {
      const id = Number(show?.id)
      if (!Number.isFinite(id)) continue
      result.set(id, show)
    }
  }

  return result
}

function dedupeRows(rows: ScrapedShowtime[]): ScrapedShowtime[] {
  const seen = new Set<string>()
  const deduped: ScrapedShowtime[] = []

  for (const row of rows) {
    const key =
      cleanText(row.sourceShowtimeId) ||
      `${cleanText(row.movieTitle)}|${cleanText(row.startTimeRaw)}|${cleanText(
        row.ticketUrl
      )}`

    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(row)
  }

  return deduped
}

function normalizeTimeLabel(input: string): string {
  let s = cleanText(input)
  if (!s) return ''

  s = s.replace(/\s*(am|pm)\b/i, (_, meridiem: string) => ` ${meridiem.toUpperCase()}`)
  return cleanText(s)
}

function parseMovieDetailShowtimes(params: {
  html: string
  movieUrl: string
  nowEpochSeconds: number
}): ScrapedShowtime[] {
  const $ = cheerio.load(params.html)

  const shownTitle =
    cleanText(
      decodeHtmlEntities($('.showtimes-description .show-title').first().text())
    ) ||
    cleanText(decodeHtmlEntities($('h1.show-title').first().text()))

  if (!shownTitle) return []

  const titleParse = parseScreeningTitle(shownTitle)

  const specRows = $('.show-specs')
    .find('span')
    .has('.show-spec-label')
    .toArray()

  let directorText: string | undefined
  let runtimeMinutes: number | undefined
  let releaseYear: number | undefined
  let rawFormat: string | undefined

  for (const el of specRows) {
    const row = $(el)
    const label = cleanText(
      decodeHtmlEntities(row.find('.show-spec-label').first().text())
    ).toLowerCase()

    const value = cleanText(
      decodeHtmlEntities(row.clone().find('.show-spec-label').remove().end().text())
    )

    if (!label || !value) continue

    if (label.includes('director') && !directorText) {
      directorText = value
      continue
    }

    if (label.includes('run time') && !runtimeMinutes) {
      runtimeMinutes = parseRuntime(value)
      continue
    }

    if (label.includes('release year') && !releaseYear) {
      releaseYear = parseYear(value)
      continue
    }

    if (label.includes('format') && !rawFormat) {
      rawFormat = parseFormat(value) || value
    }
  }

  const descriptionParagraphs = $('.show-description > p')
    .not('.show-specs')
    .map((_, el) => cleanText(decodeHtmlEntities($(el).text())))
    .get()
    .filter(Boolean)

  const overview = cleanText(descriptionParagraphs.join('\n\n')) || undefined

  const posterUrl =
    cleanText($('meta[property="og:image"]').attr('content')) || undefined

  const rows: ScrapedShowtime[] = []

  $('.showtime-button-row li[data-date]').each((_, el) => {
    const item = $(el)
    const anchor = item.find('a.showtime').first()
    if (!anchor.length) return

    const epoch = toNumber(item.attr('data-date'))
    if (!epoch || epoch <= 0) return

    const timeText = normalizeTimeLabel(
      anchor.clone().children().remove().end().text()
    )
    if (!timeText) return

    const dateLabel = parseEpochToDateLabel(epoch)
    const startDt = DateTime.fromFormat(`${dateLabel} ${timeText}`, 'MMMM d, yyyy h:mm a', {
      zone: APP_TIMEZONE,
    })

    if (!startDt.isValid || startDt.toSeconds() < params.nowEpochSeconds) {
      return
    }

    const href = cleanText(anchor.attr('href'))
    const ticketUrl = isSoldOut(anchor.attr('title'))
      ? undefined
      : buildAbsoluteUrl(params.movieUrl, href)

    const sourceShowtimeId =
      cleanText(anchor.attr('data-showtime_id')) ||
      cleanText(href.match(/\/purchase\/(\d+)\//i)?.[1])

    rows.push({
      movieTitle: titleParse.title || shownTitle,
      shownTitle,
      startTimeRaw: formatEpochToStartTimeRaw(Math.trunc(startDt.toSeconds())),
      ticketUrl,
      sourceUrl: params.movieUrl,
      rawFormat: titleParse.rawFormat || rawFormat,
      sourceShowtimeId: sourceShowtimeId || undefined,
      directorText,
      releaseYear: titleParse.releaseYear || releaseYear,
      runtimeMinutes,
      overview,
      posterUrl,
      tmdbTitleCandidates: titleParse.tmdbTitleCandidates,
      preferMovieTitleForDisplay: titleParse.preferMovieTitleForDisplay,
    })
  })

  return rows
}

async function collectSeriesMovieUrls(theater: {
  seriesLandingUrl: string
}): Promise<string[]> {
  const detailUrls = new Set<string>()
  const movieUrls = new Set<string>()

  const landingHtml = await fetchHtml(theater.seriesLandingUrl)
  const $landing = cheerio.load(landingHtml)

  const detailAnchors = $landing('#film-series-list-all a[href]')
  const detailCandidates = detailAnchors.length
    ? detailAnchors
    : $landing('a[href*="/film-series/"], a[href*="/film-series-2/"]')

  detailCandidates.each((_, el) => {
    const href = $landing(el).attr('href')
    const absolute = buildAbsoluteUrl(theater.seriesLandingUrl, href)
    if (!absolute) return

    const canonical = toCanonicalUrl(absolute)
    if (
      !canonical ||
      (!canonical.includes('/film-series/') &&
        !canonical.includes('/film-series-2/'))
    ) {
      return
    }

    if (
      canonical.endsWith('/film-series') ||
      canonical.endsWith('/film-series-2')
    ) {
      return
    }

    detailUrls.add(canonical)
  })

  let count = 0
  for (const url of detailUrls) {
    if (count >= SERIES_DETAIL_MAX) break
    count += 1

    try {
      const html = await fetchHtml(url)
      const $ = cheerio.load(html)

      $('a[href*="/movies/"]').each((_, anchor) => {
        const href = $(anchor).attr('href')
        const absolute = buildAbsoluteUrl(url, href)
        const canonical = toCanonicalUrl(absolute)
        if (!canonical || !canonical.includes('/movies/')) return

        movieUrls.add(canonical)
      })
    } catch {
      // skip one-off detail page failures; API path remains primary source.
    }
  }

  return [...movieUrls]
}

function buildRowsFromApiData(params: {
  theater: (typeof NITEHAWK_THEATERS)[keyof typeof NITEHAWK_THEATERS]
  showtimes: NitehawkShowtime[]
  showsById: Map<number, NitehawkShow>
  nowEpochSeconds: number
}): ScrapedShowtime[] {
  const rows: ScrapedShowtime[] = []

  for (const showtime of params.showtimes) {
    const sourceShowtimeId = parseShowtimeId(showtime)
    const showId = parseShowId(showtime)
    const epoch = toNumber(showtime._datetime)

    if (!sourceShowtimeId || !showId || !epoch) {
      continue
    }

    if (epoch < params.nowEpochSeconds) continue

    const show = params.showsById.get(showId)
    const shownTitle = parseTitle(show?.title)
    if (!shownTitle) continue

    const titleParse = parseScreeningTitle(shownTitle)

    const sourceUrl =
      cleanText(show?.link) ||
      buildAbsoluteUrl(params.theater.homeUrl, `movies/${cleanText(show?.slug)}/`) ||
      params.theater.homeUrl

    const directorText = parseDirectorText(show?.director)
    const releaseYear = titleParse.releaseYear || parseYear(show?._release_date)
    const runtimeMinutes = parseRuntime(show?._length || showtime._length)
    const rawFormat = titleParse.rawFormat || parseFormatFromShow(show)
    const overview =
      cleanHtmlToText(show?.content?.raw || show?.content?.rendered) ||
      cleanHtmlToText(show?.excerpt?.raw || show?.excerpt?.rendered)
    const posterUrl =
      cleanText(show?.featured_media_url) ||
      cleanText(show?._movie_still) ||
      undefined

    rows.push({
      movieTitle: titleParse.title || shownTitle,
      shownTitle,
      startTimeRaw: formatEpochToStartTimeRaw(epoch),
      ticketUrl: buildTicketUrl({
        homeUrl: params.theater.homeUrl,
        showtime,
      }),
      sourceUrl,
      rawFormat,
      sourceShowtimeId,
      directorText,
      releaseYear,
      runtimeMinutes,
      overview,
      posterUrl,
      tmdbTitleCandidates: titleParse.tmdbTitleCandidates,
      preferMovieTitleForDisplay: titleParse.preferMovieTitleForDisplay,
      matchedMovieTitleHint: titleParse.title || shownTitle,
    })
  }

  return rows
}

export async function scrapeNitehawkShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const theater = getTheaterConfig(config.theaterSlug)
  const nowEpochSeconds = Math.floor(Date.now() / 1000)

  const showtimes = await fetchFutureShowtimes(theater.homeUrl, nowEpochSeconds)
  const showIds = [...new Set(showtimes.map(parseShowId).filter((id): id is number => !!id))]
  const showsById = await fetchShowsByIds(theater.homeUrl, showIds)

  const rowsFromApi = buildRowsFromApiData({
    theater,
    showtimes,
    showsById,
    nowEpochSeconds,
  })

  // Read all series details and backfill any movie pages not present in API rows.
  // This catches edge cases where editorial pages publish first and API lag exists.
  let supplementalRows: ScrapedShowtime[] = []
  try {
    const seriesMovieUrls = await collectSeriesMovieUrls(theater)
    const apiMovieUrls = new Set(rowsFromApi.map((row) => toCanonicalUrl(row.sourceUrl)))
    const missingMovieUrls = seriesMovieUrls.filter(
      (url) => !apiMovieUrls.has(toCanonicalUrl(url))
    )

    for (const movieUrl of missingMovieUrls) {
      try {
        const html = await fetchHtml(movieUrl)
        const parsed = parseMovieDetailShowtimes({
          html,
          movieUrl,
          nowEpochSeconds,
        })

        supplementalRows = supplementalRows.concat(parsed)
      } catch {
        // continue collecting from remaining pages
      }
    }
  } catch {
    // continue with API data only if series traversal fails
  }

  const merged = dedupeRows(rowsFromApi.concat(supplementalRows))

  return merged.sort((a, b) => {
    const ta = normalizeWhitespace(a.startTimeRaw)
    const tb = normalizeWhitespace(b.startTimeRaw)
    return ta.localeCompare(tb)
  })
}
