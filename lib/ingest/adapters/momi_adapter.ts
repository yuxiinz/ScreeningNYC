// lib/ingest/adapters/momi_adapter.ts

import axios from 'axios'
import * as cheerio from 'cheerio'
import { DateTime } from 'luxon'
import type { AnyNode } from 'domhandler'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { formatShowtimeRaw, parseShowtime } from '../core/datetime'
import { parseFormat, parseRuntimeMinutes, parseYear } from '../core/meta'
import {
  cleanText,
  decodeHtmlEntities,
  isLikelyProgramTitle,
  normalizeWhitespace,
} from '../core/text'
import { buildAbsoluteUrl, pickFirstAbsoluteUrl } from '../core/url'

const MOMI_BASE_URL = 'https://movingimage.org'
const DEFAULT_MOMI_LIST_URL = 'https://movingimage.org/events/category/screening/'

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

const TITLE_LINK_SELECTOR = [
  'h1 a[href*="/event/"]',
  'h2 a[href*="/event/"]',
  'h3 a[href*="/event/"]',
  'h4 a[href*="/event/"]',
  'h5 a[href*="/event/"]',
  'h6 a[href*="/event/"]',
].join(', ')

type ListingRow = {
  movieTitle: string
  startTimeRaw: string
  sourceUrl: string
  shownTitle?: string
  overview?: string
  posterUrl?: string
}

type DetailEnrichment = {
  movieTitle?: string
  shownTitle?: string
  startTimeRaw?: string
  ticketUrl?: string
  sourceUrl?: string
  rawFormat?: string
  sourceShowtimeId?: string
  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  overview?: string
  posterUrl?: string
}

type FetchResult =
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
  return buildAbsoluteUrl(MOMI_BASE_URL, value)
}

function parseLinesFromHtml(html?: string | null): string[] {
  if (!html) return []

  const text = decodeHtmlEntities(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|article|section|header|footer|main|aside)>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  return text
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean)
}

function isCloudflareBlockedResponse(input: {
  status: number
  headers: Record<string, unknown>
  body: string
}): boolean {
  const cfMitigated =
    String(input.headers['cf-mitigated'] || '').toLowerCase() === 'challenge'

  return (
    input.status === 403 ||
    cfMitigated ||
    /Attention Required!/i.test(input.body) ||
    /Sorry, you have been blocked/i.test(input.body) ||
    /Please enable cookies/i.test(input.body) ||
    /Just a moment\.\.\./i.test(input.body) ||
    /Enable JavaScript and cookies to continue/i.test(input.body)
  )
}

async function fetchMomiPage(url: string): Promise<FetchResult> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 20000,
      headers: REQUEST_HEADERS,
      responseType: 'text',
      validateStatus: () => true,
    })

    const body = typeof res.data === 'string' ? res.data : ''
    const blocked = isCloudflareBlockedResponse({
      status: res.status,
      headers: res.headers as Record<string, unknown>,
      body,
    })

    if (blocked) {
      return { kind: 'blocked' }
    }

    if (res.status >= 200 && res.status < 300) {
      return { kind: 'ok', html: body }
    }

    return {
      kind: 'error',
      error: new Error(`MoMI request failed: ${res.status} ${url}`),
    }
  } catch (error) {
    return { kind: 'error', error }
  }
}

function extractIsoStartTimeRaw(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>
): string | undefined {
  const datetimeValues = root
    .find('time[datetime]')
    .map((_, el) => textOf($(el).attr('datetime')))
    .get()
    .filter(Boolean)

  for (const value of datetimeValues) {
    const dt = DateTime.fromISO(value, { setZone: true })
    if (dt.isValid) {
      return formatShowtimeRaw(dt.toJSDate())
    }
  }

  return undefined
}

function extractDateTimeLabel(lines: string[]): string | undefined {
  return lines.find((line) => /\bat\s+\d{1,2}:\d{2}\s*[ap]\.?m\.?/i.test(line))
}

function buildStartTimeRawFromLabel(label?: string | null): string | undefined {
  const cleaned = normalizeWhitespace(label)
  if (!cleaned) return undefined

  const split = cleaned.split(/\s+at\s+/i)
  if (split.length < 2) return undefined

  const dateText = normalizeWhitespace(split[0])
  const timeMatch = split[1]?.match(/\d{1,2}:\d{2}\s*[ap]\.?m\.?/i)
  const timeText = normalizeWhitespace(timeMatch?.[0])

  if (!dateText || !timeText) return undefined

  const parsed = parseShowtime({
    dateText,
    timeText,
  })

  if (parsed) {
    return formatShowtimeRaw(parsed)
  }

  return `${dateText} ${timeText}`.trim()
}

function extractPosterUrl(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  baseUrl: string
): string | undefined {
  const sourceSrcSet = root
    .find('source')
    .first()
    .attr('srcset')
    ?.split(',')[0]
    ?.trim()
    .split(' ')[0]

  return pickFirstAbsoluteUrl(baseUrl, [
    root.find('meta[property="og:image"]').attr('content'),
    root.find('meta[name="twitter:image"]').attr('content'),
    root.find('img').first().attr('src'),
    root.find('img').first().attr('data-src'),
    root.find('img').first().attr('data-lazy-src'),
    sourceSrcSet,
  ])
}

function findListingRoot(
  anchor: cheerio.Cheerio<AnyNode>
): cheerio.Cheerio<AnyNode> {
  const article = anchor.closest('article')
  if (article.length) return article

  const listItem = anchor.closest('li')
  if (listItem.length) return listItem

  const section = anchor.closest('section')
  if (section.length) return section

  return anchor.parent()
}

function extractListingOverview(lines: string[], movieTitle: string): string | undefined {
  return lines.find((line) => {
    if (line === movieTitle) return false
    if (/\bat\s+\d{1,2}:\d{2}\s*[ap]\.?m\.?/i.test(line)) return false
    if (line.length < 40) return false
    if (/^(previous events|next events|today)$/i.test(line)) return false
    return true
  })
}

function parseListingPage(html: string): ListingRow[] {
  const $ = cheerio.load(html)
  const rows: ListingRow[] = []
  const seen = new Set<string>()

  $(TITLE_LINK_SELECTOR).each((_, el) => {
    const anchor = $(el)
    const movieTitle = textOf(anchor.text())

    if (!movieTitle || /^events?$/i.test(movieTitle)) return

    const sourceUrl = absoluteUrl(anchor.attr('href'))
    if (!sourceUrl) return

    const root = findListingRoot(anchor)
    const lines = parseLinesFromHtml(root.html())
    const startTimeRaw =
      extractIsoStartTimeRaw($, root) ||
      buildStartTimeRawFromLabel(extractDateTimeLabel(lines))

    if (!startTimeRaw) return

    const dedupeKey = `${sourceUrl}__${startTimeRaw}`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)

    rows.push({
      movieTitle,
      shownTitle: movieTitle,
      startTimeRaw,
      sourceUrl,
      overview: extractListingOverview(lines, movieTitle),
      posterUrl: extractPosterUrl($, root, MOMI_BASE_URL),
    })
  })

  return rows
}

function collectDetailLines(html: string, movieTitle: string): string[] {
  const $ = cheerio.load(html)
  const titleHeading = $('h1')
    .filter((_, el) => textOf($(el).text()) === movieTitle)
    .first()
  const scopedRoot = titleHeading.closest(
    'article, main, .tribe-events-single, .tribe-events-pg-template, body'
  )
  const scope = scopedRoot.length ? scopedRoot : $('body')

  const allLines = parseLinesFromHtml(scope.html())
  const titleIndex = allLines.findIndex((line) => line === movieTitle)
  const startLines = titleIndex >= 0 ? allLines.slice(titleIndex + 1) : allLines
  const endIndex = startLines.findIndex((line) => {
    return (
      /^share$/i.test(line) ||
      /^add to calendar$/i.test(line) ||
      /^contact and location$/i.test(line) ||
      /^museum hours$/i.test(line)
    )
  })

  return endIndex >= 0 ? startLines.slice(0, endIndex) : startLines
}

function extractDetailTitle(html: string): string | undefined {
  const $ = cheerio.load(html)
  const headingTitle = textOf($('h1').first().text())
  if (headingTitle) return headingTitle

  const ogTitle = textOf($('meta[property="og:title"]').attr('content'))
  if (!ogTitle) return undefined

  return ogTitle.replace(/\s+[-–]\s+Museum of the Moving Image$/i, '').trim()
}

function isMetaCandidate(line: string): boolean {
  const lower = line.toLowerCase()
  return (
    /\b(18|19|20)\d{2}\b/.test(line) &&
    (/\bmins?\b/i.test(line) ||
      /\bdcp\b/i.test(line) ||
      /\b35mm\b/i.test(line) ||
      /\b16mm\b/i.test(line) ||
      /\b70mm\b/i.test(line) ||
      lower.startsWith('dir.') ||
      lower.startsWith('directed by'))
  )
}

function isIgnorableDetailLine(line: string, movieTitle: string): boolean {
  if (!line) return true
  if (line === movieTitle) return true
  if (/\bat\s+\d{1,2}:\d{2}\s*[ap]\.?m\.?/i.test(line)) return true
  if (/^location:/i.test(line)) return true
  if (/^part of\b/i.test(line)) return true
  if (/also screens on/i.test(line)) return true
  if (/^(share|share on|add to calendar)$/i.test(line)) return true
  if (/^tickets:/i.test(line)) return true
  if (/^(order tickets|purchase tickets|free with rsvp|rsvp)$/i.test(line)) {
    return true
  }
  if (/^(google calendar|icalendar|outlook 365|outlook live)$/i.test(line)) {
    return true
  }

  return false
}

function parseDirectorText(metaText?: string): string | undefined {
  const cleaned = cleanText(metaText)
  if (!cleaned) return undefined

  const match =
    cleaned.match(/(?:^|[\s(])Dir\.\s+(.+?)(?=\.\s+(?:18|19|20)\d{2}\b|$)/i) ||
    cleaned.match(
      /(?:^|[\s(])Directed by\s+(.+?)(?=\.\s+(?:18|19|20)\d{2}\b|$)/i
    )

  return match?.[1] ? normalizeWhitespace(match[1]) : undefined
}

function extractTicketUrl(
  $: cheerio.CheerioAPI
): string | undefined {
  const ticketAnchor = $('a[href]').filter((_, el) => {
    const label = textOf($(el).text())
    const href = absoluteUrl($(el).attr('href'))

    if (!href) return false

    return /order tickets|purchase tickets|reserve tickets|free with rsvp|rsvp/i.test(
      label
    )
  }).first()

  return absoluteUrl(ticketAnchor.attr('href'))
}

function extractTicketId(ticketUrl?: string): string | undefined {
  if (!ticketUrl) return undefined

  try {
    const url = new URL(ticketUrl)

    for (const param of ['txobjid', 'occ_id', 'event_id', 'id']) {
      const value = url.searchParams.get(param)
      if (value) {
        return `momi_${param}_${value}`
      }
    }
  } catch {
    return undefined
  }

  return undefined
}

function buildStableShowtimeId(input: {
  sourceUrl?: string
  startTimeRaw: string
  movieTitle: string
  ticketUrl?: string
}): string {
  const ticketId = extractTicketId(input.ticketUrl)
  if (ticketId) {
    return ticketId
  }

  if (input.sourceUrl) {
    return `${input.sourceUrl}__${input.startTimeRaw}`
  }

  return `${normalizeWhitespace(input.movieTitle).toLowerCase()}__${input.startTimeRaw}__${input.ticketUrl || ''}`
}

function parseDetailEnrichment(html: string, sourceUrl: string): DetailEnrichment {
  const $ = cheerio.load(html)
  const movieTitle = extractDetailTitle(html)
  const lines = collectDetailLines(html, movieTitle || '')
  const startTimeRaw =
    buildStartTimeRawFromLabel(extractDateTimeLabel(lines)) || undefined
  const ticketUrl = extractTicketUrl($)
  const contentLines = lines.filter(
    (line) => !isIgnorableDetailLine(line, movieTitle || '')
  )
  const metaCandidates = contentLines.filter(isMetaCandidate)
  const treatAsProgram =
    isLikelyProgramTitle(movieTitle) || metaCandidates.length > 1
  const metaText = treatAsProgram ? undefined : metaCandidates[0]
  const overviewLines = contentLines.filter(
    (line) => line.length >= 40 && !isMetaCandidate(line)
  )
  const overview = normalizeWhitespace(overviewLines.join('\n\n')) || undefined
  const posterUrl = pickFirstAbsoluteUrl(sourceUrl, [
    $('meta[property="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    $('img').first().attr('src'),
    $('img').first().attr('data-src'),
  ])

  return {
    movieTitle,
    shownTitle: movieTitle,
    startTimeRaw,
    ticketUrl,
    sourceUrl,
    rawFormat: treatAsProgram ? undefined : parseFormat(metaText),
    sourceShowtimeId:
      movieTitle && startTimeRaw
        ? buildStableShowtimeId({
            sourceUrl,
            startTimeRaw,
            movieTitle,
            ticketUrl,
          })
        : undefined,
    directorText: treatAsProgram ? undefined : parseDirectorText(metaText),
    releaseYear: treatAsProgram ? undefined : parseYear(metaText),
    runtimeMinutes: treatAsProgram ? undefined : parseRuntimeMinutes(metaText),
    overview,
    posterUrl,
  }
}

export async function scrapeMomiShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const listingUrl =
    normalizeWhitespace(config.sourceUrl) || DEFAULT_MOMI_LIST_URL

  const listingResult = await fetchMomiPage(listingUrl)
  if (listingResult.kind === 'blocked') {
    throw new Error(
      `[momi] Listing request was blocked by Cloudflare: ${listingUrl}`
    )
  }
  if (listingResult.kind === 'error') {
    throw listingResult.error
  }

  const listingRows = parseListingPage(listingResult.html)

  let detailAttempted = 0
  let detailSucceeded = 0
  let detailBlocked = 0

  const detailCache = new Map<string, DetailEnrichment | null>()
  const rows: ScrapedShowtime[] = []

  for (const row of listingRows) {
    let detail: DetailEnrichment | null = null

    if (detailCache.has(row.sourceUrl)) {
      detail = detailCache.get(row.sourceUrl) || null
    } else {
      detailAttempted += 1
      const detailResult = await fetchMomiPage(row.sourceUrl)

      if (detailResult.kind === 'ok') {
        detail = parseDetailEnrichment(detailResult.html, row.sourceUrl)
        detailSucceeded += 1
        detailCache.set(row.sourceUrl, detail)
      } else if (detailResult.kind === 'blocked') {
        detailBlocked += 1
        detailCache.set(row.sourceUrl, null)
      } else {
        detailCache.set(row.sourceUrl, null)
      }
    }

    const movieTitle = detail?.movieTitle || row.movieTitle
    const startTimeRaw = detail?.startTimeRaw || row.startTimeRaw
    const sourceUrl = detail?.sourceUrl || row.sourceUrl
    const ticketUrl = detail?.ticketUrl
    const sourceShowtimeId =
      detail?.sourceShowtimeId ||
      buildStableShowtimeId({
        sourceUrl,
        startTimeRaw,
        movieTitle,
        ticketUrl,
      })

    rows.push({
      movieTitle,
      shownTitle: detail?.shownTitle || row.shownTitle,
      startTimeRaw,
      ticketUrl,
      sourceUrl,
      rawFormat: detail?.rawFormat,
      sourceShowtimeId,
      directorText: detail?.directorText,
      releaseYear: detail?.releaseYear,
      runtimeMinutes: detail?.runtimeMinutes,
      overview: detail?.overview || row.overview,
      posterUrl: row.posterUrl || detail?.posterUrl,
    })
  }

  console.log(
    `[momi] listing rows parsed: ${listingRows.length}; detail enrichment attempted: ${detailAttempted}; detail enrichment succeeded: ${detailSucceeded}; detail enrichment blocked by Cloudflare: ${detailBlocked}`
  )

  return rows
}
