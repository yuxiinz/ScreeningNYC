import axios from 'axios'
import * as cheerio from 'cheerio'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { parseFormat, parseRuntimeMinutes, parseYear } from '../core/meta'
import { parseScreeningTitle } from '../core/screening_title'
import { cleanText, decodeHtmlEntities } from '../core/text'
import { buildAbsoluteUrl, pickFirstAbsoluteUrl } from '../core/url'

const JAPAN_SOCIETY_BASE_URL = 'https://japansociety.org'
const DEFAULT_JAPAN_SOCIETY_API_URL =
  'https://japansociety.org/wp-json/events/v1/data?events_categories=9127&limit=120'

const API_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
}

type JapanSocietyEventTime = {
  date?: string
  time_start?: string
  time_end?: string
}

type JapanSocietyMultiDayEvent = {
  date_start?: string
  date_end?: string
  time_start?: string
  time_end?: string
}

type JapanSocietyEvent = {
  id?: number
  title?: string
  permalink?: string
  imgSet?: {
    mobile?: string
    desktop?: string
  }
  days?: {
    all_day?: boolean
    type?: string
    milti_day_events?: JapanSocietyMultiDayEvent | null
    single_day_events?: JapanSocietyEventTime[] | null
  }
}

type JapanSocietyTitleParse = {
  shownTitle: string
  movieTitle: string
  tmdbTitleCandidates?: string[]
  preferMovieTitleForDisplay?: boolean
  matchedMovieTitleHint?: string
}

type JapanSocietyDetailEnrichment = JapanSocietyTitleParse & {
  ticketUrl?: string
  overview?: string
  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  rawFormat?: string
  posterUrl?: string
}

function textOf(value?: string | null): string {
  return cleanText(decodeHtmlEntities(value))
}

function normalizeComparableText(value?: string | null): string {
  return textOf(value).toLowerCase()
}

function uniqueStrings(values: Array<string | undefined>): string[] | undefined {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const cleaned = textOf(value)
    if (!cleaned) continue

    const normalized = normalizeComparableText(cleaned)
    if (seen.has(normalized)) continue

    seen.add(normalized)
    result.push(cleaned)
  }

  return result.length ? result : undefined
}

function htmlToTextWithBreaks(value?: string | null): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(?:div|figure|figcaption|li|ul|ol|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
}

function splitHtmlLines(value?: string | null): string[] {
  return htmlToTextWithBreaks(value)
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean)
}

function isLikelyTitleCandidateLine(line?: string | null): boolean {
  const cleaned = textOf(line)
  if (!cleaned) return false

  if (
    /^presented\b/i.test(cleaned) ||
    /^copies will\b/i.test(cleaned) ||
    /^part of\b/i.test(cleaned) ||
    /^dir\.\b/i.test(cleaned) ||
    /^[:©]/.test(cleaned) ||
    /^film programs?\b/i.test(cleaned)
  ) {
    return false
  }

  if (cleaned.length > 80 && /[.!?]/.test(cleaned)) {
    return false
  }

  if (/[.!?]$/.test(cleaned) && cleaned.split(/\s+/).length > 8) {
    return false
  }

  return true
}

function extractTitleCandidatesFromParagraphs($: cheerio.CheerioAPI): string[] | undefined {
  const paragraphs = $('.event-content__group_main p').slice(0, 4).toArray()

  for (const element of paragraphs) {
    const lines = splitHtmlLines($(element).html() || '')
    const paragraphCandidates: string[] = []

    for (const line of lines) {
      if (!isLikelyTitleCandidateLine(line)) {
        break
      }

      paragraphCandidates.push(line)
      if (paragraphCandidates.length >= 4) {
        break
      }
    }

    if (paragraphCandidates.length) {
      return uniqueStrings(paragraphCandidates)
    }
  }

  return undefined
}

function stripCuratorialPrefix(title: string): string {
  const cleaned = textOf(title)
  if (!cleaned) return ''

  const presentsMatch = cleaned.match(/^(.+?)\s+Presents\s+(.+)$/i)
  if (presentsMatch?.[1] && presentsMatch[2]) {
    const prefix = textOf(presentsMatch[1])
    const rest = textOf(presentsMatch[2])

    if (prefix && rest && prefix.split(/\s+/).length <= 5) {
      return rest
    }
  }

  return cleaned
}

function stripGuestSuffix(title: string): string {
  let cleaned = textOf(title)
  if (!cleaned) return ''

  cleaned = cleaned.replace(
    /\s+with\s+.+?(?:q(?:\s*&\s*|\s+and\s+)a|q&a|qa|introduction|intro|in person)\b.*$/i,
    ''
  )
  cleaned = cleaned.replace(
    /\s*[-–—:]\s*(?:q(?:\s*&\s*|\s+and\s+)a|q&a|qa|introduction|intro|in person)\b.*$/i,
    ''
  )

  return textOf(cleaned)
}

function deriveJapanSocietyTitleParse(input: {
  shownTitle?: string
  altTitleCandidates?: string[]
}): JapanSocietyTitleParse {
  const shownTitle = textOf(input.shownTitle)
  if (!shownTitle) {
    return {
      shownTitle: '',
      movieTitle: '',
    }
  }

  let movieTitle = stripGuestSuffix(stripCuratorialPrefix(shownTitle))
  const parsedTitle = parseScreeningTitle(movieTitle)

  movieTitle = textOf(parsedTitle.title) || shownTitle

  const tmdbTitleCandidates = uniqueStrings([
    shownTitle,
    ...(parsedTitle.tmdbTitleCandidates || []),
    ...(input.altTitleCandidates || []),
  ])?.filter(
    (candidate) =>
      normalizeComparableText(candidate) !== normalizeComparableText(movieTitle)
  )

  const preferMovieTitleForDisplay = movieTitle !== shownTitle

  return {
    shownTitle,
    movieTitle,
    tmdbTitleCandidates: tmdbTitleCandidates?.length ? tmdbTitleCandidates : undefined,
    preferMovieTitleForDisplay: preferMovieTitleForDisplay || undefined,
    matchedMovieTitleHint: preferMovieTitleForDisplay ? movieTitle : undefined,
  }
}

function findPrimaryContentParagraphHtml($: cheerio.CheerioAPI): string | undefined {
  const paragraphs = $('.event-content__group_main p')

  const withMeta = paragraphs
    .filter((_, element) => /\bDir\.\s+/i.test(textOf($(element).text())))
    .first()

  if (withMeta.length) {
    return withMeta.html() || undefined
  }

  const longest = paragraphs
    .map((_, element) => ({
      html: $(element).html() || '',
      text: textOf($(element).text()),
    }))
    .get()
    .filter((entry) => entry.text.length >= 120)
    .sort((a, b) => b.text.length - a.text.length)[0]

  return longest?.html || undefined
}

function extractMetaText(paragraphHtml?: string): string | undefined {
  const collapsed = cleanText(htmlToTextWithBreaks(paragraphHtml))
  if (!collapsed) return undefined

  const match = collapsed.match(/(Dir\..+?)(?=\bPart of\b|$)/i)
  return textOf(match?.[1]) || undefined
}

function extractOverview(paragraphHtml?: string): string | undefined {
  const lines = splitHtmlLines(paragraphHtml)
  if (!lines.length) return undefined

  while (lines.length && isLikelyTitleCandidateLine(lines[0])) {
    lines.shift()
  }

  let overview = cleanText(lines.join(' '))
  if (!overview) return undefined

  overview = overview.replace(/\bDir\..+$/i, '')
  overview = overview.replace(/\bPart of\b.+$/i, '')
  overview = cleanText(overview)

  return overview || undefined
}

function extractDirectorText(metaText?: string): string | undefined {
  const cleaned = textOf(metaText)
  if (!cleaned) return undefined

  const match = cleaned.match(
    /\bDir\.\s+(.+?)(?=(?:,\s*|\.\s*)(?:18|19|20)\d{2}\b)/i
  )

  return textOf(match?.[1]) || undefined
}

function extractTicketUrl(
  $: cheerio.CheerioAPI,
  detailUrl: string
): string | undefined {
  const href =
    $('.event-content__group_side_buttons a[href*="boxoffice"]').first().attr('href') ||
    $('.event-content__group_side_buttons a.brand-button[href]').first().attr('href')

  return buildAbsoluteUrl(detailUrl, href)
}

function extractDetailEnrichment(
  detailHtml: string,
  detailUrl: string,
  fallbackShownTitle: string,
  fallbackPosterUrl?: string
): JapanSocietyDetailEnrichment {
  const $ = cheerio.load(detailHtml)
  const shownTitle =
    textOf($('.event-info_title').first().text()) ||
    textOf($("meta[property='og:title']").attr('content')) ||
    fallbackShownTitle
  const altTitleCandidates = extractTitleCandidatesFromParagraphs($)
  const titleParse = deriveJapanSocietyTitleParse({
    shownTitle,
    altTitleCandidates,
  })
  const primaryParagraphHtml = findPrimaryContentParagraphHtml($)
  const metaText = extractMetaText(primaryParagraphHtml)
  const overview =
    extractOverview(primaryParagraphHtml) ||
    textOf($("meta[property='og:description']").attr('content')) ||
    textOf($("meta[name='description']").attr('content')) ||
    undefined
  const posterUrl = pickFirstAbsoluteUrl(detailUrl, [
    fallbackPosterUrl,
    $("meta[property='og:image']").attr('content'),
    $("link[rel='image_src']").attr('href'),
  ])

  return {
    ...titleParse,
    ticketUrl: extractTicketUrl($, detailUrl),
    overview,
    directorText: extractDirectorText(metaText),
    releaseYear: parseYear(metaText),
    runtimeMinutes: parseRuntimeMinutes(metaText),
    rawFormat: parseFormat(metaText),
    posterUrl,
  }
}

function extractOccurrenceRows(event: JapanSocietyEvent): JapanSocietyEventTime[] {
  const days = event.days
  if (!days || days.all_day) {
    return []
  }

  if (Array.isArray(days.single_day_events)) {
    return days.single_day_events.filter(
      (entry) => textOf(entry?.date) && textOf(entry?.time_start)
    )
  }

  const multiDay = days.milti_day_events
  if (!multiDay) {
    return []
  }

  const dateStart = textOf(multiDay.date_start)
  const dateEnd = textOf(multiDay.date_end)
  const timeStart = textOf(multiDay.time_start)

  if (!dateStart || !dateEnd || !timeStart) {
    return []
  }

  if (normalizeComparableText(dateStart) !== normalizeComparableText(dateEnd)) {
    return []
  }

  return [
    {
      date: dateStart,
      time_start: timeStart,
      time_end: textOf(multiDay.time_end) || undefined,
    },
  ]
}

function buildSourceShowtimeId(
  sourceEventId: number,
  occurrence: JapanSocietyEventTime
): string {
  return `${sourceEventId}__${textOf(occurrence.date)}__${textOf(occurrence.time_start)}`
}

async function fetchJapanSocietyEvents(sourceUrl: string): Promise<JapanSocietyEvent[]> {
  const response = await axios.get<JapanSocietyEvent[]>(sourceUrl, {
    timeout: 20000,
    headers: API_HEADERS,
    responseType: 'json',
  })

  return Array.isArray(response.data) ? response.data : []
}

async function scrapeJapanSocietyEvent(
  event: JapanSocietyEvent
): Promise<ScrapedShowtime[]> {
  const sourceEventId = event.id
  const shownTitle = textOf(event.title)
  const sourceUrl = buildAbsoluteUrl(JAPAN_SOCIETY_BASE_URL, event.permalink)
  const posterUrl = pickFirstAbsoluteUrl(JAPAN_SOCIETY_BASE_URL, [
    event.imgSet?.desktop,
    event.imgSet?.mobile,
  ])
  const occurrences = extractOccurrenceRows(event)

  if (!sourceEventId || !shownTitle || !sourceUrl || !occurrences.length) {
    return []
  }

  const fallbackTitleParse = deriveJapanSocietyTitleParse({
    shownTitle,
  })

  let detail: JapanSocietyDetailEnrichment = {
    ...fallbackTitleParse,
    posterUrl,
  }

  try {
    const detailHtml = await fetchHtml(sourceUrl)
    detail = extractDetailEnrichment(detailHtml, sourceUrl, shownTitle, posterUrl)
  } catch (error) {
    console.error('[japansociety] detail fetch failed:', sourceUrl, error)
  }

  return occurrences.map((occurrence) => ({
    movieTitle: detail.movieTitle || fallbackTitleParse.movieTitle,
    shownTitle: detail.shownTitle || fallbackTitleParse.shownTitle,
    startTimeRaw: `${textOf(occurrence.date)} ${textOf(occurrence.time_start)}`.trim(),
    ticketUrl: detail.ticketUrl,
    sourceUrl,
    rawFormat: detail.rawFormat,
    sourceShowtimeId: buildSourceShowtimeId(sourceEventId, occurrence),
    directorText: detail.directorText,
    releaseYear: detail.releaseYear,
    runtimeMinutes: detail.runtimeMinutes,
    overview: detail.overview,
    posterUrl: detail.posterUrl || posterUrl,
    tmdbTitleCandidates: detail.tmdbTitleCandidates,
    preferMovieTitleForDisplay: detail.preferMovieTitleForDisplay,
    matchedMovieTitleHint: detail.matchedMovieTitleHint,
  }))
}

function dedupeShowtimes(rows: ScrapedShowtime[]): ScrapedShowtime[] {
  const seen = new Set<string>()
  const deduped: ScrapedShowtime[] = []

  for (const row of rows) {
    const key =
      row.sourceShowtimeId ||
      `${normalizeComparableText(row.sourceUrl)}|${normalizeComparableText(row.shownTitle || row.movieTitle)}|${row.startTimeRaw}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(row)
  }

  return deduped
}

export async function scrapeJapanSocietyShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const sourceUrl =
    textOf(config.sourceUrl) || DEFAULT_JAPAN_SOCIETY_API_URL
  const events = await fetchJapanSocietyEvents(sourceUrl)
  const settled = await Promise.allSettled(
    events.map((event) => scrapeJapanSocietyEvent(event))
  )

  const rows: ScrapedShowtime[] = []

  for (const result of settled) {
    if (result.status !== 'fulfilled') {
      console.error('[japansociety] event scrape failed:', result.reason)
      continue
    }

    rows.push(...result.value)
  }

  return dedupeShowtimes(rows)
}
