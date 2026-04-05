// lib/ingest/adapters/moma_adapter.ts

import axios from 'axios'
import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { formatShowtimeRaw, parseShowtime } from '../core/datetime'
import { parseFormat, parseRuntimeMinutes, parseYear } from '../core/meta'
import {
  cleanPossessivePrefixTitle,
  cleanText,
  decodeHtmlEntities,
  normalizeWhitespace,
} from '../core/text'
import { buildAbsoluteUrl } from '../core/url'
import { getTodayInAppTimezone } from '../../timezone'

const MOMA_BASE_URL = 'https://www.moma.org'
const DEFAULT_MOMA_FILMS_URL =
  'https://www.moma.org/calendar/?happening_filter=Films&locale=en&location=both'

const DETAIL_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

type ListingRow = {
  movieTitle: string
  dateText: string
  timeText: string
  locationText?: string
  ticketUrl?: string
  sourceUrl?: string
  posterUrl?: string
  directorText?: string
  releaseYear?: number
  startTimeRaw: string
  sourceShowtimeId: string
}

type DetailEnrichment = {
  overview?: string
  runtimeMinutes?: number
  rawFormat?: string
  directorText?: string
  releaseYear?: number
  posterUrl?: string
}

type DetailFetchResult =
  | {
      kind: 'ok'
      html: string
    }
  | {
      kind: 'blocked'
    }
  | {
      kind: 'error'
      error: unknown
    }

function textOf(value?: string | null): string {
  return cleanText(decodeHtmlEntities(value))
}

function absoluteUrl(value?: string | null): string | undefined {
  return buildAbsoluteUrl(MOMA_BASE_URL, value)
}

function normalizeMomaTimeLabel(value?: string | null): string {
  let s = textOf(value)
  if (!s) return ''

  s = s.replace(/\u2013|\u2014/g, '-')
  s = s.replace(/\ba\.\s*m\./gi, 'AM')
  s = s.replace(/\bp\.\s*m\./gi, 'PM')
  s = s.replace(/\ba\.m\./gi, 'AM')
  s = s.replace(/\bp\.m\./gi, 'PM')
  s = s.replace(/(\d)(am|pm)\b/gi, '$1 $2')
  s = s.replace(/(\d:\d{2})(am|pm)\b/gi, '$1 $2')
  s = s.replace(/\s+to\s+/gi, '-')
  s = s.replace(/\s*-\s*/g, '-')
  const rangeMatch = s.match(/^(\d{1,2}(?::\d{2})?)\s*(AM|PM)?-(\d{1,2}(?::\d{2})?)\s*(AM|PM)?$/i)
  if (rangeMatch) {
    const startTime = rangeMatch[1]
    const startSuffix = rangeMatch[2]
    const endSuffix = rangeMatch[4]
    const suffix = startSuffix || endSuffix || ''
    s = `${startTime} ${suffix}`.trim()
  }
  s = s.replace(/\s+/g, ' ').trim()

  return s
}

function parseInlineMeta(metaText?: string | null): {
  movieTitle: string
  directorText?: string
  releaseYear?: number
} {
  const raw = textOf(metaText)
  if (!raw) {
    return { movieTitle: '' }
  }

  const cleaned = normalizeWhitespace(raw)

  const directorMatch = cleaned.match(
    /\b(?:WRITTEN AND DIRECTED BY|Directed by)\s+(.+?)$/i
  )

  const directorText = directorMatch?.[1]
    ? normalizeWhitespace(directorMatch[1].replace(/\.$/, ''))
    : undefined

  const beforeDirector = directorMatch
    ? cleaned.slice(0, directorMatch.index).trim()
    : cleaned

  const withoutTrailingDot = beforeDirector.replace(/\.\s*$/, '').trim()

  let movieTitle = withoutTrailingDot
  let releaseYear: number | undefined

  const yearMatch = withoutTrailingDot.match(
    /^(.*?)\.\s*((?:18|19|20)\d{2})(?:\s*(?:-|–|\/|to)\s*(?:18|19|20)\d{2})?$/
  )

  if (yearMatch) {
    movieTitle = normalizeWhitespace(yearMatch[1]).trim()
    releaseYear = Number(yearMatch[2])
  }

  movieTitle = cleanPossessivePrefixTitle(movieTitle)
  movieTitle = movieTitle.replace(/\s*\([^)]*\)\s*$/, '').trim()
  movieTitle = movieTitle.replace(/\.\s*$/, '').trim()

  return {
    movieTitle,
    directorText,
    releaseYear,
  }
}

function parseCompactOccurrenceDateTime(value?: string | null): Date | null {
  const s = textOf(value)
  if (!s) return null

  const match = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])

  const dt = new Date(year, month - 1, day, hour, minute, second)

  return Number.isNaN(dt.getTime()) ? null : dt
}

function tryBuildStartTimeRaw(dateText: string, timeText: string): string {
  const dt = parseShowtime({
    dateText,
    timeText: normalizeMomaTimeLabel(timeText),
  })

  if (dt) {
    return formatShowtimeRaw(dt)
  }

  return `${normalizeWhitespace(dateText)} ${normalizeMomaTimeLabel(timeText)}`.trim()
}

function buildLoadMoreUrl(baseUrl: string, date: string, page: number): string {
  const url = new URL(baseUrl)

  url.searchParams.set('happening_filter', 'Films')
  url.searchParams.set('location', 'both')
  url.searchParams.set('locale', 'en')
  url.searchParams.set('date', date)
  url.searchParams.set('page', String(page))

  return url.toString()
}

function extractCalendarDateFromUrl(urlString: string): string | undefined {
  try {
    const url = new URL(urlString)
    const date = url.searchParams.get('date') || undefined
    return date || undefined
  } catch {
    return undefined
  }
}

async function scrapeAllListingRows(listingUrl: string): Promise<ListingRow[]> {
  const allRows: ListingRow[] = []
  const seen = new Set<string>()

  const firstHtml = await fetchHtml(listingUrl)
  const firstRows = parseListingPage(firstHtml)

  for (const row of firstRows) {
    if (seen.has(row.sourceShowtimeId)) continue
    seen.add(row.sourceShowtimeId)
    allRows.push(row)
  }

  console.log(`[moma] page 1 parsed: ${firstRows.length}, total unique: ${allRows.length}`)

  const dateParam =
    extractCalendarDateFromUrl(listingUrl) ||
    getTodayInAppTimezone()

  let emptyPageStreak = 0
  const maxPages = 20

  for (let page = 2; page <= maxPages; page += 1) {
    const moreUrl = buildLoadMoreUrl(listingUrl, dateParam, page)
    const html = await fetchHtml(moreUrl)
    const pageRows = parseListingPage(html)

    let newCount = 0

    for (const row of pageRows) {
      if (seen.has(row.sourceShowtimeId)) continue
      seen.add(row.sourceShowtimeId)
      allRows.push(row)
      newCount += 1
    }

    console.log(`[moma] page ${page} parsed: ${pageRows.length}, new: ${newCount}, total unique: ${allRows.length}`)

    if (newCount === 0) {
      emptyPageStreak += 1
    } else {
      emptyPageStreak = 0
    }

    if (emptyPageStreak >= 2) {
      break
    }
  }

  return allRows
}

function extractOccId(ticketUrl?: string): string | undefined {
  if (!ticketUrl) return undefined

  try {
    const url = new URL(ticketUrl)
    return url.searchParams.get('occ_id') || undefined
  } catch {
    return undefined
  }
}

function buildStableShowtimeId(input: {
  sourceUrl?: string
  movieTitle: string
  startTimeRaw: string
  ticketUrl?: string
}): string {
  const occId = extractOccId(input.ticketUrl)
  if (occId) {
    return `moma_occ_${occId}`
  }

  if (input.sourceUrl) {
    return `${input.sourceUrl}__${input.startTimeRaw}`
  }

  return `${normalizeWhitespace(input.movieTitle).toLowerCase()}__${input.startTimeRaw}__${input.ticketUrl || ''}`
}

function findBestTicketUrl(
  $: cheerio.CheerioAPI,
  card: cheerio.Cheerio<AnyNode>,
  sourceUrl?: string
): string | undefined {
  const localTicket = card.find('a[href]').filter((_, el) => {
    const href = $(el).attr('href') || ''
    const label = textOf($(el).text())
    const abs = absoluteUrl(href)

    if (!abs) return false

    return (
      /reserve tickets|tickets/i.test(label) ||
      /membership\.moma\.org\/tickets/i.test(abs) ||
      /occ_id=/i.test(abs)
    )
  }).first()

  const localHref = absoluteUrl(localTicket.attr('href'))
  if (localHref) return localHref

  const parentLi = card.closest('li')
  const siblingTicket = parentLi.find('a[href]').filter((_, el) => {
    const href = $(el).attr('href') || ''
    const label = textOf($(el).text())
    const abs = absoluteUrl(href)

    if (!abs) return false

    return (
      /reserve tickets|tickets/i.test(label) ||
      /membership\.moma\.org\/tickets/i.test(abs) ||
      /occ_id=/i.test(abs)
    )
  }).first()

  const siblingHref = absoluteUrl(siblingTicket.attr('href'))
  if (siblingHref) return siblingHref

  return sourceUrl
}

function parseListingPage(html: string): ListingRow[] {
  const $ = cheerio.load(html)
  const rows: ListingRow[] = []
  const seen = new Set<string>()

  $('[data-pagination-insertion] > li').each((_, sectionEl) => {
    const section = $(sectionEl)
    const dateText = textOf(section.find('h2').first().text())
    if (!dateText) return

    section.find('a[href*="/calendar/events/"]').each((__, anchorEl) => {
      const anchor = $(anchorEl)
      const sourceUrl = absoluteUrl(anchor.attr('href'))
      if (!sourceUrl) return

      const metaNode = anchor.find('p').filter((___, pEl) => {
        const txt = textOf($(pEl).text())
        return /Directed by/i.test(txt)
      }).first()

      const metaText =
        textOf(metaNode.text()) ||
        textOf(anchor.find('img').first().attr('alt')) ||
        textOf(anchor.text())

      const parsedMeta = parseInlineMeta(metaText)
      const movieTitle = parsedMeta.movieTitle
      if (!movieTitle) return
      if (/^image credit:/i.test(movieTitle)) return

      const timeNode = anchor.find('p').filter((___, pEl) => {
        const txt = textOf($(pEl).text())
        return /\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?/i.test(txt)
      }).first()

      const timeText = normalizeMomaTimeLabel(timeNode.text())
      if (!timeText) return

      const allPs = anchor.find('p').map((___, pEl) => textOf($(pEl).text())).get().filter(Boolean)

      let locationText: string | undefined
      for (const value of allPs) {
        if (/^\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?$/i.test(value)) continue
        if (/Directed by/i.test(value)) continue
        if (/^Film$/i.test(value)) continue
        if (/MoMA|Theater|Floor/i.test(value)) {
          locationText = value
          break
        }
      }

      const posterUrl =
        absoluteUrl(anchor.find('img').first().attr('src')) ||
        absoluteUrl(anchor.find('source').first().attr('srcset')?.split(',')[0]?.trim().split(' ')[0])

      const ticketUrl = findBestTicketUrl($, anchor, sourceUrl)

      let startTimeRaw = tryBuildStartTimeRaw(dateText, timeText)

      const dataAddNode = anchor.closest('li').find('[data-occurrence-begin-datetime]').first()
      const compactDate = parseCompactOccurrenceDateTime(dataAddNode.attr('data-occurrence-begin-datetime'))
      if (compactDate) {
        startTimeRaw = formatShowtimeRaw(compactDate)
      }

      const sourceShowtimeId = buildStableShowtimeId({
        sourceUrl,
        movieTitle,
        startTimeRaw,
        ticketUrl,
      })

      const dedupeKey = `${sourceShowtimeId}||${movieTitle}`
      if (seen.has(dedupeKey)) return
      seen.add(dedupeKey)

      rows.push({
        movieTitle,
        dateText,
        timeText,
        locationText,
        ticketUrl,
        sourceUrl,
        posterUrl,
        directorText: parsedMeta.directorText,
        releaseYear: parsedMeta.releaseYear,
        startTimeRaw,
        sourceShowtimeId,
      })
    })
  })

  return rows
}

async function fetchDetailPage(url: string): Promise<DetailFetchResult> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 20000,
      headers: DETAIL_HEADERS,
      responseType: 'text',
      validateStatus: () => true,
    })

    const body = typeof res.data === 'string' ? res.data : ''
    const cfMitigated = String(res.headers['cf-mitigated'] || '').toLowerCase() === 'challenge'
    const looksBlocked =
      res.status === 403 ||
      cfMitigated ||
      /Just a moment\.\.\./i.test(body) ||
      /Enable JavaScript and cookies to continue/i.test(body)

    if (looksBlocked) {
      return { kind: 'blocked' }
    }

    if (res.status >= 200 && res.status < 300) {
      return { kind: 'ok', html: body }
    }

    return {
      kind: 'error',
      error: new Error(`MoMA detail request failed: ${res.status} ${url}`),
    }
  } catch (error) {
    return { kind: 'error', error }
  }
}

function parseDetailEnrichment(html: string): DetailEnrichment {
  const $ = cheerio.load(html)

  const paragraphTexts = $('p')
    .map((_, el) => textOf($(el).text()))
    .get()
    .filter(Boolean)

  const metaText = paragraphTexts.find((value) => {
    return /\b(18|19|20)\d{2}\b/.test(value) && /Directed by/i.test(value)
  })

  const overview = paragraphTexts.find((value) => {
    return value.length > 120 && !/Directed by/i.test(value)
  })

  const directorMatch = metaText?.match(/Directed by\s+(.+?)(?:\.|$)/i)
  const directorText = directorMatch?.[1]
    ? normalizeWhitespace(directorMatch[1])
    : undefined

  const releaseYear = parseYear(metaText)
  const runtimeMinutes = parseRuntimeMinutes(metaText)
  const rawFormat = parseFormat(metaText)

  const posterUrl =
    absoluteUrl($('meta[property="og:image"]').attr('content')) ||
    absoluteUrl($('img').first().attr('src'))

  return {
    overview,
    runtimeMinutes,
    rawFormat,
    directorText,
    releaseYear,
    posterUrl,
  }
}

export async function scrapeMomaShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const listingUrl = normalizeWhitespace(config.sourceUrl) || DEFAULT_MOMA_FILMS_URL

  const listingRows = await scrapeAllListingRows(listingUrl)

  let detailAttempted = 0
  let detailSucceeded = 0
  let detailBlocked = 0

  const detailCache = new Map<string, DetailEnrichment | null>()
  const output: ScrapedShowtime[] = []

  for (const row of listingRows) {
    let enrichment: DetailEnrichment | null = null

    if (row.sourceUrl) {
      if (detailCache.has(row.sourceUrl)) {
        enrichment = detailCache.get(row.sourceUrl) || null
      } else {
        detailAttempted += 1
        const detailResult = await fetchDetailPage(row.sourceUrl)

        if (detailResult.kind === 'ok') {
          enrichment = parseDetailEnrichment(detailResult.html)
          detailSucceeded += 1
          detailCache.set(row.sourceUrl, enrichment)
        } else if (detailResult.kind === 'blocked') {
          detailBlocked += 1
          detailCache.set(row.sourceUrl, null)
        } else {
          detailCache.set(row.sourceUrl, null)
        }
      }
    }

    output.push({
      movieTitle: row.movieTitle,
      startTimeRaw: row.startTimeRaw,
      ticketUrl: row.ticketUrl,
      sourceUrl: row.sourceUrl,
      rawFormat: enrichment?.rawFormat,
      sourceShowtimeId: row.sourceShowtimeId,
      directorText: row.directorText || enrichment?.directorText,
      releaseYear: row.releaseYear ?? enrichment?.releaseYear,
      runtimeMinutes: enrichment?.runtimeMinutes,
      overview: enrichment?.overview,
      posterUrl: row.posterUrl || enrichment?.posterUrl,
    })
  }

  console.log(
    `[moma] listing rows parsed: ${listingRows.length}; detail enrichment attempted: ${detailAttempted}; detail enrichment succeeded: ${detailSucceeded}; detail enrichment blocked by Cloudflare: ${detailBlocked}`
  )

  return output
}
