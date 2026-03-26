import axios from 'axios'
import * as cheerio from 'cheerio'
import { DateTime } from 'luxon'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { cleanText, decodeHtmlEntities, normalizeWhitespace } from '../core/text'
import { buildAbsoluteUrl } from '../core/url'

const PARIS_BASE_URL = 'https://www.paristheaternyc.com'
const CMS_BASE_URL = 'https://cms.ntflxthtrs.com'
const LISTING_URLS = [
  'https://www.paristheaternyc.com/series-and-events',
  'https://www.paristheaternyc.com/special-engagements',
]

const DETAIL_FETCH_CONCURRENCY = 6
const VISTA_FETCH_CONCURRENCY = 4

const VISTA_AUTH_URL =
  process.env.PARIS_VISTA_AUTH_URL || 'https://auth.moviexchange.com/connect/token'
const VISTA_API_BASE =
  process.env.PARIS_VISTA_API_BASE ||
  'https://digital-api.paristheaternyc.com/ocapi/v1'
const VISTA_SITE_ID = process.env.PARIS_VISTA_SITE_ID || '2001'
const VISTA_USERNAME =
  process.env.PARIS_VISTA_USERNAME || 'webhost-browsing-parisnyc'
const VISTA_PASSWORD =
  process.env.PARIS_VISTA_PASSWORD || 'HzaJe65EAPNto7sR5'
const VISTA_CLIENT_ID =
  process.env.PARIS_VISTA_CLIENT_ID || 'webhost-browsing-parisnyc'

type ParisEventRow = {
  eventDate: string
  eventTime: string
  ticketUrl?: string
}

type ParisStandaloneEvent = {
  eventName: string
  eventDate: string
  eventTime: string
  ticketUrl?: string
  slug?: string
}

type ParisFilm = {
  slug: string
  filmName: string
  detailUrl?: string
  directorText?: string
  runtimeMinutes?: number
  releaseYear?: number
  overview?: string
  rawFormat?: string
  vistaId?: string
  ticketUrl?: string
  hasThirdPartyTicketLink?: boolean
  isAmericanCinematheque?: boolean
  posterUrl?: string
  events: ParisEventRow[]
}

type VistaTokenResponse = {
  access_token?: string
}

type VistaScreeningDatesResponse = {
  filmScreeningDates?: Array<{
    businessDate?: string
  }>
}

type VistaShowtime = {
  id?: string
  filmId?: string
  schedule?: {
    startsAt?: string
  }
}

type VistaRelatedFilm = {
  id?: string
  title?: {
    text?: string
  }
  synopsis?: {
    text?: string
  }
  releaseDate?: string
  runtimeInMinutes?: number
}

type VistaShowtimesByDateResponse = {
  businessDate?: string
  showtimes?: VistaShowtime[]
  relatedData?: {
    films?: VistaRelatedFilm[]
  }
}

function decodeEscapedUnicode(input?: string | null): string {
  const value = input || ''

  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\\//g, '/')
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
}

function decodeValue(input?: string | null): string {
  return cleanText(decodeHtmlEntities(decodeEscapedUnicode(input)))
}

function toCmsUrl(path?: string): string | undefined {
  const cleaned = cleanText(path)
  if (!cleaned) return undefined
  if (/^https?:\/\//i.test(cleaned)) return cleaned
  if (cleaned.startsWith('/')) return `${CMS_BASE_URL}${cleaned}`
  return undefined
}

function normalizeParisUrl(url?: string | null): string | undefined {
  const cleaned = cleanText(url)
  if (!cleaned) return undefined

  try {
    const parsed = new URL(cleaned)
    if (parsed.hostname !== 'www.paristheaternyc.com') return undefined
    parsed.hash = ''
    parsed.search = ''
    return parsed.toString()
  } catch {
    return undefined
  }
}

function isParisDetailPath(pathname: string): boolean {
  return (
    pathname.startsWith('/film/') ||
    pathname.startsWith('/series/') ||
    pathname.startsWith('/event/')
  )
}

function buildParisDetailUrl(path: string): string | undefined {
  const absolute = buildAbsoluteUrl(PARIS_BASE_URL, path)
  return normalizeParisUrl(absolute)
}

function extractScriptText(html: string): string {
  const $ = cheerio.load(html)
  return $('script')
    .map((_, element) => $(element).html() || '')
    .get()
    .join('\n')
    .replace(/\\"/g, '"')
}

function extractField(block: string, pattern: RegExp): string | undefined {
  const matched = block.match(pattern)
  return matched?.[1]
}

function extractBetween(
  source: string,
  startToken: string,
  endToken: string
): string | undefined {
  const start = source.indexOf(startToken)
  if (start < 0) return undefined

  const from = start + startToken.length
  const end = source.indexOf(endToken, from)
  if (end < 0) return undefined

  return source.slice(from, end)
}

function cleanOverview(raw?: string): string | undefined {
  const decoded = decodeEscapedUnicode(raw)
  if (!decoded) return undefined

  const withoutTags = decodeHtmlEntities(decoded)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')

  const cleaned = cleanText(withoutTags)
  return cleaned || undefined
}

function parseRuntimeMinutes(raw?: string): number | undefined {
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

function parseReleaseYear(raw?: string): number | undefined {
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1888 || parsed > 2100) return undefined
  return parsed
}

function parseFilmEvents(eventsChunk?: string): ParisEventRow[] {
  if (!eventsChunk) return []

  const rows: ParisEventRow[] = []
  const eventRe =
    /"EventDate":"(?<eventDate>\d{4}-\d{2}-\d{2})"[\s\S]*?"EventTime":"(?<eventTime>[^"]+?)"(?:[\s\S]*?"TicketLink":"(?<ticketUrl>[^"]+?)")?/g

  let matched: RegExpExecArray | null
  while ((matched = eventRe.exec(eventsChunk)) !== null) {
    const { eventDate, eventTime, ticketUrl } = matched.groups || {}
    if (!eventDate || !eventTime) continue

    rows.push({
      eventDate,
      eventTime: decodeValue(eventTime),
      ticketUrl: decodeValue(ticketUrl) || undefined,
    })
  }

  return rows
}

function extractFilmsFromScripts(
  scripts: string,
  baseUrl: string
): ParisFilm[] {
  const films: ParisFilm[] = []

  const filmBlockRe =
    /"FilmName":"(?<filmName>[^"]+?)"[\s\S]*?"Slug":"(?<slug>[^"]+?)"[\s\S]*?"events":\{"data":\[(?<events>[\s\S]*?)\]\}/g

  let matched: RegExpExecArray | null
  while ((matched = filmBlockRe.exec(scripts)) !== null) {
    const { filmName, slug, events } = matched.groups || {}
    if (!filmName || !slug) continue

    const block = matched[0]
    const vistaId =
      decodeValue(extractField(block, /"VistaIDOverride":"([^"]+?)"/)) ||
      decodeValue(extractField(block, /"VistaID":"([^"]+?)"/)) ||
      undefined
    const isAmericanCinematheque =
      extractField(block, /"IsAmericanCinematheque":(true|false)/) === 'true'
    const hasThirdPartyTicketLink =
      extractField(block, /"HasThirdPartyTicketLink":(true|false)/) === 'true'
    const thirdPartyTicketUrl =
      decodeValue(extractField(block, /"ThirdPartyTicketLink":"([^"]+?)"/)) ||
      undefined
    const overviewFromWysiwyg = cleanOverview(
      extractBetween(block, '"SynopsisWYSIWYG":"', '","FilmFormat"')
    )
    const overviewFromSynopsis = cleanOverview(
      extractBetween(block, '"Synopsis":"', '","Rating"')
    )
    const posterUrl = toCmsUrl(
      extractField(
        block,
        /"Poster":\{"data":\{"id":\d+,"attributes":\{[\s\S]*?"url":"(\/uploads\/[^"]+?)"/
      )
    )

    const detailUrl =
      buildParisDetailUrl(`/film/${slug}`) || normalizeParisUrl(baseUrl)

    films.push({
      slug,
      filmName: decodeValue(filmName),
      detailUrl,
      directorText:
        decodeValue(extractField(block, /"Director":"([^"]*?)"/)) || undefined,
      runtimeMinutes: parseRuntimeMinutes(extractField(block, /"Runtime":(\d+)/)),
      releaseYear: parseReleaseYear(extractField(block, /"Year":"(\d{4})"/)),
      overview: overviewFromWysiwyg || overviewFromSynopsis,
      rawFormat:
        decodeValue(extractField(block, /"FilmFormat":"([^"]*?)"/)) || undefined,
      vistaId,
      ticketUrl: thirdPartyTicketUrl,
      hasThirdPartyTicketLink,
      isAmericanCinematheque,
      posterUrl,
      events: parseFilmEvents(events),
    })
  }

  return films
}

function extractSeriesSlugs(scripts: string): string[] {
  const slugs: string[] = []
  const seriesRe =
    /"SeriesName":"[^"]+?"[\s\S]{0,3000}?"Slug":"(?<slug>[a-z0-9-]+)"/g

  let matched: RegExpExecArray | null
  while ((matched = seriesRe.exec(scripts)) !== null) {
    const slug = matched.groups?.slug
    if (slug) slugs.push(slug)
  }

  return [...new Set(slugs)]
}

function extractEventSlugs(scripts: string): string[] {
  const slugs: string[] = []
  const eventRe =
    /"EventName":"[^"]+?"[\s\S]{0,3000}?"Slug":"(?<slug>[a-z0-9-]+)"/g

  let matched: RegExpExecArray | null
  while ((matched = eventRe.exec(scripts)) !== null) {
    const slug = matched.groups?.slug
    if (slug) slugs.push(slug)
  }

  return [...new Set(slugs)]
}

function extractStandaloneEvents(scripts: string): ParisStandaloneEvent[] {
  const events: ParisStandaloneEvent[] = []
  const eventRe =
    /"EventName":"(?<eventName>[^"]+?)"[\s\S]{0,1500}?"EventDate":"(?<eventDate>\d{4}-\d{2}-\d{2})"[\s\S]{0,800}?"EventTime":"(?<eventTime>[^"]+?)"(?:[\s\S]{0,1500}?"TicketLink":"(?<ticketUrl>[^"]+?)")?(?:[\s\S]{0,1500}?"Slug":"(?<slug>[a-z0-9-]+)")?/g

  let matched: RegExpExecArray | null
  while ((matched = eventRe.exec(scripts)) !== null) {
    const { eventName, eventDate, eventTime, ticketUrl, slug } = matched.groups || {}
    if (!eventName || !eventDate || !eventTime) continue

    events.push({
      eventName: decodeValue(eventName),
      eventDate,
      eventTime: decodeValue(eventTime),
      ticketUrl: decodeValue(ticketUrl) || undefined,
      slug,
    })
  }

  return events
}

function extractDetailUrlsFromAnchors(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html)
  const urls = new Set<string>()

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href')
    if (!href) return
    const absolute = buildAbsoluteUrl(baseUrl, href)
    const normalized = normalizeParisUrl(absolute)
    if (!normalized) return

    try {
      const parsed = new URL(normalized)
      if (isParisDetailPath(parsed.pathname)) {
        urls.add(normalized)
      }
    } catch {
      // ignore invalid links
    }
  })

  return [...urls]
}

function extractDetailUrlsFromScripts(scripts: string): string[] {
  const urls = new Set<string>()
  const pathRe = /\/(?:film|series|event)\/[a-z0-9-]+/g

  let pathMatched: RegExpExecArray | null
  while ((pathMatched = pathRe.exec(scripts)) !== null) {
    const absolute = buildParisDetailUrl(pathMatched[0])
    if (absolute) urls.add(absolute)
  }

  for (const slug of extractSeriesSlugs(scripts)) {
    const absolute = buildParisDetailUrl(`/series/${slug}`)
    if (absolute) urls.add(absolute)
  }

  for (const slug of extractEventSlugs(scripts)) {
    const absolute = buildParisDetailUrl(`/event/${slug}`)
    if (absolute) urls.add(absolute)
  }

  return [...urls]
}

function mergeEvents(
  existing: ParisEventRow[],
  incoming: ParisEventRow[]
): ParisEventRow[] {
  const merged = [...existing]
  const seen = new Set(
    merged.map(
      (row) =>
        `${row.eventDate}|${normalizeWhitespace(row.eventTime)}|${cleanText(row.ticketUrl)}`
    )
  )

  for (const row of incoming) {
    const key = `${row.eventDate}|${normalizeWhitespace(row.eventTime)}|${cleanText(
      row.ticketUrl
    )}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(row)
  }

  return merged
}

function pickText(
  current?: string,
  incoming?: string
): string | undefined {
  const c = cleanText(current)
  const i = cleanText(incoming)
  if (!c) return i || undefined
  if (!i) return c
  return i.length > c.length ? i : c
}

function mergeFilm(existing: ParisFilm, incoming: ParisFilm): ParisFilm {
  return {
    slug: existing.slug,
    filmName: pickText(existing.filmName, incoming.filmName) || existing.slug,
    detailUrl: incoming.detailUrl || existing.detailUrl,
    directorText: pickText(existing.directorText, incoming.directorText),
    runtimeMinutes: existing.runtimeMinutes || incoming.runtimeMinutes,
    releaseYear: existing.releaseYear || incoming.releaseYear,
    overview: pickText(existing.overview, incoming.overview),
    rawFormat: pickText(existing.rawFormat, incoming.rawFormat),
    vistaId: pickText(existing.vistaId, incoming.vistaId),
    ticketUrl: incoming.ticketUrl || existing.ticketUrl,
    hasThirdPartyTicketLink:
      existing.hasThirdPartyTicketLink || incoming.hasThirdPartyTicketLink,
    isAmericanCinematheque:
      existing.isAmericanCinematheque || incoming.isAmericanCinematheque,
    posterUrl: incoming.posterUrl || existing.posterUrl,
    events: mergeEvents(existing.events, incoming.events),
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []

  const limit = Math.max(1, Math.min(concurrency, items.length))
  const results = new Array<R>(items.length)
  let index = 0

  async function worker() {
    while (index < items.length) {
      const currentIndex = index
      index += 1
      results[currentIndex] = await task(items[currentIndex])
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  return results
}

async function fetchVistaAccessToken(): Promise<string | null> {
  if (!VISTA_USERNAME || !VISTA_PASSWORD || !VISTA_CLIENT_ID) return null

  const body = new URLSearchParams({
    grant_type: 'password',
    username: VISTA_USERNAME,
    password: VISTA_PASSWORD,
    client_id: VISTA_CLIENT_ID,
  })

  try {
    const response = await axios.post<VistaTokenResponse>(
      VISTA_AUTH_URL,
      body.toString(),
      {
        timeout: 20000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )

    const token = cleanText(response.data?.access_token)
    return token || null
  } catch {
    return null
  }
}

async function fetchVistaScreeningDates(token: string): Promise<string[]> {
  try {
    const response = await axios.get<VistaScreeningDatesResponse>(
      `${VISTA_API_BASE}/film-screening-dates`,
      {
        timeout: 20000,
        params: { siteIds: VISTA_SITE_ID },
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    )

    const dates = (response.data.filmScreeningDates || [])
      .map((item) => cleanText(item.businessDate))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))

    return [...new Set(dates)].sort()
  } catch {
    return []
  }
}

async function fetchVistaShowtimesByDate(
  token: string,
  businessDate: string
): Promise<VistaShowtimesByDateResponse | null> {
  try {
    const response = await axios.get<VistaShowtimesByDateResponse>(
      `${VISTA_API_BASE}/showtimes/by-business-date/${businessDate}`,
      {
        timeout: 20000,
        params: { siteIds: VISTA_SITE_ID },
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    )

    return response.data
  } catch {
    return null
  }
}

function buildVistaTicketUrl(showtimeId: string): string {
  return `https://tickets.paristheaternyc.com/order/showtimes/${showtimeId}/seats`
}

function resolveFilmTicketUrl(film?: ParisFilm, showtimeId?: string): string | undefined {
  if (film?.isAmericanCinematheque) {
    return 'https://www.americancinematheque.com'
  }

  if (film?.hasThirdPartyTicketLink && film.ticketUrl) {
    return film.ticketUrl
  }

  if (showtimeId) return buildVistaTicketUrl(showtimeId)
  return film?.ticketUrl
}

function normalizeEventTime(timeText: string): string {
  let value = normalizeWhitespace(timeText)
    .replace(/\./g, '')
    .replace(/\bET\b/i, '')
    .trim()

  value = value.replace(/^(\d{1,2})\s*(AM|PM)$/i, '$1:00 $2')
  value = value.replace(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i, '$1:$2 $3')

  return value.toUpperCase()
}

function parseYearFromDate(raw?: string): number | undefined {
  const cleaned = cleanText(raw)
  if (!cleaned) return undefined
  const matched = cleaned.match(/^(\d{4})/)
  if (!matched?.[1]) return undefined
  return parseReleaseYear(matched[1])
}

function isLikelyActiveEventDate(dateIso: string): boolean {
  const dt = DateTime.fromISO(dateIso, { zone: 'America/New_York' })
  if (!dt.isValid) return false

  const today = DateTime.now().setZone('America/New_York').startOf('day')
  if (dt < today) return false
  if (dt > today.plus({ months: 12 })) return false

  return true
}

function dedupeShowtimes(rows: ScrapedShowtime[]): ScrapedShowtime[] {
  const seenSourceIds = new Set<string>()
  const seenSemantic = new Set<string>()
  const deduped: ScrapedShowtime[] = []

  for (const row of rows) {
    const sourceId = cleanText(row.sourceShowtimeId)
    if (sourceId) {
      if (seenSourceIds.has(sourceId)) continue
      seenSourceIds.add(sourceId)
    }

    const semanticKey = [
      cleanText(row.startTimeRaw),
      cleanText(row.ticketUrl),
    ].join('|')

    if (seenSemantic.has(semanticKey)) continue
    seenSemantic.add(semanticKey)
    deduped.push(row)
  }

  return deduped
}

async function scrapeVistaShowtimes(
  filmByVistaId: Map<string, ParisFilm>,
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const token = await fetchVistaAccessToken()
  if (!token) return []

  const dates = await fetchVistaScreeningDates(token)
  if (dates.length === 0) return []

  const responses = await mapWithConcurrency(
    dates,
    VISTA_FETCH_CONCURRENCY,
    async (date) => fetchVistaShowtimesByDate(token, date)
  )

  const rows: ScrapedShowtime[] = []

  for (const response of responses) {
    if (!response) continue

    const relatedFilms = new Map<string, VistaRelatedFilm>()
    for (const film of response.relatedData?.films || []) {
      const filmId = cleanText(film.id)
      if (!filmId) continue
      relatedFilms.set(filmId, film)
    }

    for (const showtime of response.showtimes || []) {
      const showtimeId = cleanText(showtime.id)
      const startsAt = cleanText(showtime.schedule?.startsAt)
      if (!showtimeId || !startsAt) continue

      const filmId = cleanText(showtime.filmId)
      const film = filmId ? filmByVistaId.get(filmId) : undefined
      const relatedFilm = filmId ? relatedFilms.get(filmId) : undefined

      const movieTitle =
        pickText(film?.filmName, decodeValue(relatedFilm?.title?.text)) || filmId
      if (!movieTitle) continue

      rows.push({
        movieTitle,
        startTimeRaw: startsAt,
        ticketUrl: resolveFilmTicketUrl(film, showtimeId),
        sourceUrl: film?.detailUrl || config.sourceUrl,
        rawFormat: film?.rawFormat,
        sourceShowtimeId: showtimeId,
        directorText: film?.directorText,
        releaseYear: film?.releaseYear || parseYearFromDate(relatedFilm?.releaseDate),
        runtimeMinutes: film?.runtimeMinutes || relatedFilm?.runtimeInMinutes,
        overview: film?.overview || decodeValue(relatedFilm?.synopsis?.text) || undefined,
        posterUrl: film?.posterUrl,
        matchedMovieTitleHint: film?.filmName || movieTitle,
      })
    }
  }

  return dedupeShowtimes(rows)
}

function buildFilmEventShowtimes(
  films: Iterable<ParisFilm>,
  config: TheaterAdapterConfig
): ScrapedShowtime[] {
  const rows: ScrapedShowtime[] = []

  for (const film of films) {
    for (const eventRow of film.events) {
      const normalizedTime = normalizeEventTime(eventRow.eventTime)
      if (!eventRow.eventDate || !normalizedTime) continue
      if (!isLikelyActiveEventDate(eventRow.eventDate)) continue

      rows.push({
        movieTitle: film.filmName,
        startTimeRaw: `${eventRow.eventDate} ${normalizedTime}`,
        ticketUrl: eventRow.ticketUrl || resolveFilmTicketUrl(film),
        sourceUrl: film.detailUrl || config.sourceUrl,
        rawFormat: film.rawFormat,
        sourceShowtimeId: `${film.slug}__${eventRow.eventDate}__${normalizedTime}`,
        directorText: film.directorText,
        releaseYear: film.releaseYear,
        runtimeMinutes: film.runtimeMinutes,
        overview: film.overview,
        posterUrl: film.posterUrl,
        matchedMovieTitleHint: film.filmName,
      })
    }
  }

  return rows
}

function buildStandaloneEventShowtimes(
  events: ParisStandaloneEvent[],
  config: TheaterAdapterConfig
): ScrapedShowtime[] {
  const rows: ScrapedShowtime[] = []

  for (const event of events) {
    const normalizedTime = normalizeEventTime(event.eventTime)
    if (!event.eventDate || !normalizedTime || !event.eventName) continue
    if (!isLikelyActiveEventDate(event.eventDate)) continue

    rows.push({
      movieTitle: event.eventName,
      startTimeRaw: `${event.eventDate} ${normalizedTime}`,
      ticketUrl: event.ticketUrl,
      sourceUrl: event.slug
        ? buildParisDetailUrl(`/event/${event.slug}`) || config.sourceUrl
        : config.sourceUrl,
      sourceShowtimeId: event.slug
        ? `event__${event.slug}__${event.eventDate}__${normalizedTime}`
        : undefined,
      matchedMovieTitleHint: event.eventName,
    })
  }

  return rows
}

export async function scrapeParisShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const filmMap = new Map<string, ParisFilm>()
  const standaloneEvents: ParisStandaloneEvent[] = []
  const detailUrls = new Set<string>()

  for (const listingUrl of LISTING_URLS) {
    try {
      const html = await fetchHtml(listingUrl)
      const scripts = extractScriptText(html)
      const films = extractFilmsFromScripts(scripts, listingUrl)
      const scriptDetailUrls = extractDetailUrlsFromScripts(scripts)
      const anchorDetailUrls = extractDetailUrlsFromAnchors(html, listingUrl)

      for (const film of films) {
        const existing = filmMap.get(film.slug)
        if (existing) {
          filmMap.set(film.slug, mergeFilm(existing, film))
        } else {
          filmMap.set(film.slug, film)
        }

        if (film.detailUrl) detailUrls.add(film.detailUrl)
      }

      extractStandaloneEvents(scripts).forEach((event) => standaloneEvents.push(event))
      scriptDetailUrls.forEach((url) => detailUrls.add(url))
      anchorDetailUrls.forEach((url) => detailUrls.add(url))
    } catch {
      // Preserve partial ingestion if one listing fails.
    }
  }

  const detailUrlList = [...detailUrls]

  const detailPages = await mapWithConcurrency(
    detailUrlList,
    DETAIL_FETCH_CONCURRENCY,
    async (url) => {
      try {
        const html = await fetchHtml(url)
        return { url, html }
      } catch {
        return null
      }
    }
  )

  for (const page of detailPages) {
    if (!page) continue

    const scripts = extractScriptText(page.html)
    const films = extractFilmsFromScripts(scripts, page.url)

    for (const film of films) {
      const existing = filmMap.get(film.slug)
      if (existing) {
        filmMap.set(film.slug, mergeFilm(existing, film))
      } else {
        filmMap.set(film.slug, film)
      }
    }

    extractStandaloneEvents(scripts).forEach((event) => standaloneEvents.push(event))
  }

  const filmByVistaId = new Map<string, ParisFilm>()
  for (const film of filmMap.values()) {
    if (!film.vistaId) continue
    if (!filmByVistaId.has(film.vistaId)) {
      filmByVistaId.set(film.vistaId, film)
      continue
    }

    const existing = filmByVistaId.get(film.vistaId)
    if (!existing) {
      filmByVistaId.set(film.vistaId, film)
      continue
    }

    filmByVistaId.set(film.vistaId, mergeFilm(existing, film))
  }

  const vistaShowtimes = await scrapeVistaShowtimes(filmByVistaId, config)
  const filmEventShowtimes = buildFilmEventShowtimes(filmMap.values(), config)
  const standaloneEventShowtimes = buildStandaloneEventShowtimes(
    standaloneEvents,
    config
  )

  return dedupeShowtimes([
    ...vistaShowtimes,
    ...filmEventShowtimes,
    ...standaloneEventShowtimes,
  ])
}
