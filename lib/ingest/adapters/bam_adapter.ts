import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { dedupeByKeys } from '../core/collection'
import { fetchHtml } from '../core/http'
import { fetchJson } from '@/lib/http/server-fetch'
import { parseFormat, parseRuntimeMinutes, parseYear } from '../core/meta'
import { buildAbsoluteUrl } from '../core/url'
import {
  cleanText,
  decodeHtmlEntities,
  getUniqueStrings,
  normalizeLooseComparableText,
  stripOuterQuotes,
} from '../core/text'
import { FREE_TICKET_SENTINEL } from '../../showtime/ticket'

const BAM_BASE_URL = 'https://www.bam.org'

const API_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'application/json,text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

type BamListEntry = {
  detailUrl: string
  posterUrl?: string
}

type BamJsonLdOffer =
  | {
      url?: string
    }
  | Array<{
      url?: string
    }>

type BamJsonLdEvent = {
  '@type'?: string | string[]
  startDate?: string
  offers?: BamJsonLdOffer
}

type BamTitleParse = {
  movieTitle: string
  shownTitle: string
  tmdbTitleCandidates?: string[]
  preferMovieTitleForDisplay?: boolean
  matchedMovieTitleHint?: string
}

type BamDetailMeta = BamTitleParse & {
  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  overview?: string
  rawFormat?: string
  posterUrl?: string
  isFreeAdmission: boolean
}

function cleanHtmlText(value?: string | null): string | undefined {
  const decoded = decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')

  const cleaned = cleanText(decoded)
  return cleaned || undefined
}

const normalizeComparableText = (value?: string | null) =>
  normalizeLooseComparableText(stripOuterQuotes(decodeHtmlEntities(value)))

function extractSourceShowtimeId(ticketUrl?: string): string | undefined {
  const cleaned = cleanText(ticketUrl)
  if (!cleaned || cleaned === FREE_TICKET_SENTINEL) return undefined

  const match =
    cleaned.match(/\/booking\/production\/(\d+)/i) ||
    cleaned.match(/\/production\/(\d+)/i)

  return match?.[1]
}

function parseOffersUrl(offers?: BamJsonLdOffer): string | undefined {
  if (!offers) return undefined

  if (Array.isArray(offers)) {
    return cleanText(offers.find((offer) => cleanText(offer?.url))?.url) || undefined
  }

  return cleanText(offers.url) || undefined
}

function hasEventType(value?: string | string[]): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => cleanText(item).toLowerCase() === 'event')
  }

  return cleanText(value).toLowerCase() === 'event'
}

function getFilmLabel(root: cheerio.Cheerio<AnyNode>): string {
  return (
    cleanText(root.find('.bam-block-2x2-label').first().text()) ||
    cleanText(root.find('.bam-block-2x1-right-label').first().text()) ||
    cleanText(root.find('.eventInfo .genre').first().text()) ||
    ''
  )
}

function getDetailUrl(
  root: cheerio.Cheerio<AnyNode>,
  pageUrl: string
): string | undefined {
  const href =
    root.find('a.btn[href]:not(.buy-button)').first().attr('href') ||
    root.find('.bam-block-2x2-mobile-box > a[href]').first().attr('href') ||
    root.find('.bam-block-2x1-mobile-box > a[href]').first().attr('href') ||
    root.find('a[href]').first().attr('href')

  return buildAbsoluteUrl(pageUrl, href)
}

function getListPosterUrl(
  root: cheerio.Cheerio<AnyNode>,
  pageUrl: string
): string | undefined {
  const src =
    root.find('.bam-block-2x2-top img').first().attr('src') ||
    root.find('.bam-block-2x1-left img').first().attr('src') ||
    root.find('.bam-block-2x2-mobile-box img').first().attr('src') ||
    root.find('picture img').first().attr('src') ||
    root.find('img').first().attr('src')

  return buildAbsoluteUrl(pageUrl, src)
}

function isBadBamPosterUrl(url?: string | null): boolean {
  const cleaned = cleanText(url).toLowerCase()

  if (!cleaned) {
    return true
  }

  return cleaned.includes('bam_logo.gif') || cleaned.includes('/static/img/logo/')
}

export function chooseBamPosterUrl(params: {
  detailPosterUrl?: string
  listPosterUrl?: string
}): string | undefined {
  const detailPosterUrl = buildAbsoluteUrl(BAM_BASE_URL, params.detailPosterUrl)
  const listPosterUrl = buildAbsoluteUrl(BAM_BASE_URL, params.listPosterUrl)

  if (detailPosterUrl && !isBadBamPosterUrl(detailPosterUrl)) {
    return detailPosterUrl
  }

  return listPosterUrl || detailPosterUrl || undefined
}

function stripPrimaryBillingPrefix(
  title: string,
  primaryBilling?: string
): string | undefined {
  const cleanedTitle = stripOuterQuotes(title)
  const billing = cleanText(primaryBilling)

  if (!cleanedTitle || !billing) return undefined

  const normalizedTitle = normalizeComparableText(cleanedTitle)
  const normalizedBilling = normalizeComparableText(billing)

  if (!normalizedTitle.startsWith(normalizedBilling)) {
    return undefined
  }

  const sliced = cleanedTitle
    .slice(billing.length)
    .replace(/^[\s:–—-]+/, '')
    .trim()

  return sliced ? stripOuterQuotes(sliced) : undefined
}

function stripWithSuffixMatchingDirector(
  title: string,
  directorText?: string
): string | undefined {
  const cleanedTitle = stripOuterQuotes(title)
  const normalizedDirector = normalizeComparableText(directorText)

  if (!cleanedTitle || !normalizedDirector) {
    return undefined
  }

  const match = cleanedTitle.match(/^(.+?)\s+with\s+(.+)$/i)
  if (!match?.[1] || !match[2]) {
    return undefined
  }

  const suffix = normalizeComparableText(match[2])
  if (!suffix) return undefined

  const suffixParts = suffix.split(/\s+/).filter(Boolean)
  const directorParts = normalizedDirector.split(/\s+/).filter(Boolean)

  if (
    suffix === normalizedDirector ||
    suffixParts.every((part) => directorParts.includes(part))
  ) {
    const stripped = stripOuterQuotes(match[1])
    return stripped || undefined
  }

  return undefined
}

function deriveBamTitle(input: {
  shownTitle?: string
  directorText?: string
  primaryBilling?: string
}): BamTitleParse {
  const shownTitle = stripOuterQuotes(decodeHtmlEntities(input.shownTitle))
  if (!shownTitle) {
    return {
      movieTitle: '',
      shownTitle: '',
    }
  }

  let movieTitle = shownTitle

  const withoutPrimaryBilling = stripPrimaryBillingPrefix(
    movieTitle,
    input.primaryBilling
  )
  if (withoutPrimaryBilling) {
    movieTitle = withoutPrimaryBilling
  }

  const withoutDirectorSuffix = stripWithSuffixMatchingDirector(
    movieTitle,
    input.directorText
  )
  if (withoutDirectorSuffix) {
    movieTitle = withoutDirectorSuffix
  }

  movieTitle = stripOuterQuotes(movieTitle) || shownTitle
  const preferMovieTitleForDisplay = movieTitle !== shownTitle

  return {
    movieTitle,
    shownTitle,
    tmdbTitleCandidates: getUniqueStrings(
      preferMovieTitleForDisplay ? [shownTitle] : []
    ),
    preferMovieTitleForDisplay: preferMovieTitleForDisplay || undefined,
    matchedMovieTitleHint: preferMovieTitleForDisplay ? movieTitle : undefined,
  }
}

function extractSectionBlocks(
  $: cheerio.CheerioAPI,
  headingText: string
): cheerio.Cheerio<AnyNode>[] {
  const heading = $('.heroInfoRightDetails h2')
    .filter((_, el) => cleanText($(el).text()).toUpperCase() === headingText.toUpperCase())
    .first()

  if (!heading.length) return []

  const blocks: cheerio.Cheerio<AnyNode>[] = []
  let current = heading.next()

  while (current.length) {
    const tagName = current.get(0)?.tagName?.toLowerCase()
    if (tagName === 'h2') break

    if (tagName !== 'script' && tagName !== 'style') {
      blocks.push(current)
    }

    current = current.next()
  }

  return blocks
}

function extractSectionTexts(
  $: cheerio.CheerioAPI,
  headingText: string
): string[] {
  return extractSectionBlocks($, headingText)
    .map((block) => cleanHtmlText(block.html() || block.text()))
    .filter((value): value is string => Boolean(value))
}

function isFreeAdmission(
  $: cheerio.CheerioAPI,
  ticketTexts: string[]
): boolean {
  const stickerTexts = $('.bam-block-hero-stickers .bam-btn-2, .bam-block-hero-stickers .bam-btn-3')
    .map((_, el) => cleanText($(el).text()))
    .get()

  return [...ticketTexts, ...stickerTexts].some((text) =>
    /\bfree\b/i.test(text)
  )
}

export function parseBamListPage(html: string, pageUrl: string): BamListEntry[] {
  const $ = cheerio.load(html)
  const entries = new Map<string, BamListEntry>()

  $('.productionblock').each((_, element) => {
    const root = $(element)
    const label = getFilmLabel(root).toLowerCase()
    if (label !== 'film') return

    const detailUrl = getDetailUrl(root, pageUrl)
    if (!detailUrl) return
    const posterUrl = getListPosterUrl(root, pageUrl)

    if (!entries.has(detailUrl)) {
      entries.set(detailUrl, {
        detailUrl,
        posterUrl,
      })
    }
  })

  return [...entries.values()]
}

function extractDetailBasics(
  $: cheerio.CheerioAPI,
  detailUrl: string,
  listPosterUrl?: string
): BamDetailMeta {
  const rawShownTitle =
    cleanText(decodeHtmlEntities($('h1').first().text())) ||
    cleanText(decodeHtmlEntities($("meta[property='og:title']").attr('content'))) ||
    cleanText(decodeHtmlEntities($('title').first().text()).replace(/^BAM\s*\|\s*/i, ''))

  const directedByText = cleanText(
    decodeHtmlEntities($('.directedByText').first().text())
  )
  const directorMatch = directedByText.match(
    /Directed by\s+(.+?)(?=\s*\((?:18|19|20)\d{2}\)|$)/i
  )
  const directorText = cleanText(directorMatch?.[1]) || undefined
  const releaseYear = parseYear(directedByText) || undefined
  const primaryBilling = cleanText(
    decodeHtmlEntities($('.primary-billing').first().text())
  )

  const titleParse = deriveBamTitle({
    shownTitle: rawShownTitle,
    directorText,
    primaryBilling,
  })

  const runtimeMinutes =
    parseRuntimeMinutes(extractSectionTexts($, 'RUNNING TIME').join(' ')) || undefined
  const rawFormat =
    parseFormat(extractSectionTexts($, 'FORMAT').join(' ')) || undefined
  const overview =
    cleanHtmlText($('.heroInfoLeft .description').first().html()) ||
    cleanHtmlText($("meta[name='description']").attr('content'))
  const posterUrl = chooseBamPosterUrl({
    detailPosterUrl:
      buildAbsoluteUrl(detailUrl, $("meta[property='og:image']").attr('content')) ||
      buildAbsoluteUrl(detailUrl, $('link[rel="image_src"]').attr('content')) ||
      buildAbsoluteUrl(detailUrl, $('.bam-block-hero-box img').first().attr('src')),
    listPosterUrl,
  })

  const ticketTexts = extractSectionTexts($, 'TICKET INFORMATION')

  return {
    ...titleParse,
    directorText,
    releaseYear,
    runtimeMinutes,
    overview,
    rawFormat,
    posterUrl,
    isFreeAdmission: isFreeAdmission($, ticketTexts),
  }
}

function parseJsonLdShowtimes(
  $: cheerio.CheerioAPI,
  detailUrl: string,
  meta: BamDetailMeta
): ScrapedShowtime[] {
  const scripts = $("script[type='application/ld+json']")
  const rows: ScrapedShowtime[] = []

  scripts.each((_, element) => {
    const rawJson = $(element).contents().text()
    if (!cleanText(rawJson)) return

    try {
      const parsed = JSON.parse(rawJson) as {
        graph?: BamJsonLdEvent[]
      }

      const events = (parsed.graph || []).filter((item) =>
        hasEventType(item?.['@type'])
      )

      for (const event of events) {
        const startDate = cleanText(event.startDate)
        if (!startDate) continue

        const offeredUrl = parseOffersUrl(event.offers)
        const ticketUrl =
          offeredUrl || (meta.isFreeAdmission ? FREE_TICKET_SENTINEL : undefined)

        rows.push({
          movieTitle: meta.movieTitle,
          shownTitle: meta.shownTitle,
          startTimeRaw: startDate,
          ticketUrl,
          sourceUrl: detailUrl,
          rawFormat: meta.rawFormat,
          sourceShowtimeId: extractSourceShowtimeId(ticketUrl),
          directorText: meta.directorText,
          releaseYear: meta.releaseYear,
          runtimeMinutes: meta.runtimeMinutes,
          overview: meta.overview,
          posterUrl: meta.posterUrl,
          tmdbTitleCandidates: meta.tmdbTitleCandidates,
          preferMovieTitleForDisplay: meta.preferMovieTitleForDisplay,
          matchedMovieTitleHint: meta.matchedMovieTitleHint,
        })
      }
    } catch {
      return
    }
  })

  return rows
}

async function fetchPerformanceRows(
  detailHtml: string
): Promise<string[]> {
  const match = detailHtml.match(
    /GetPerformancesByProduction\?ProductionPageId=(\d+)/i
  )

  if (!match?.[1]) {
    return []
  }

  const apiUrl = `${BAM_BASE_URL}/api/BAMApi/GetPerformancesByProduction?ProductionPageId=${match[1]}`
  const response = await fetchJson<string[]>(apiUrl, {
    timeout: 20000,
    headers: API_HEADERS,
  })

  return Array.isArray(response.data) ? response.data : []
}

function parsePerformanceApiShowtimes(
  performanceRows: string[],
  detailUrl: string,
  meta: BamDetailMeta
): ScrapedShowtime[] {
  const rows: ScrapedShowtime[] = []

  for (const rowHtml of performanceRows) {
    const $ = cheerio.load(rowHtml)
    const perfText = cleanText($('.perfData').first().text())
    if (!perfText) continue

    const href = $('a[href]').first().attr('href')
    const absoluteTicketUrl = buildAbsoluteUrl(detailUrl, href)
    const ticketUrl =
      absoluteTicketUrl || (meta.isFreeAdmission ? FREE_TICKET_SENTINEL : undefined)

    rows.push({
      movieTitle: meta.movieTitle,
      shownTitle: meta.shownTitle,
      startTimeRaw: perfText,
      ticketUrl,
      sourceUrl: detailUrl,
      rawFormat: meta.rawFormat,
      sourceShowtimeId: extractSourceShowtimeId(ticketUrl),
      directorText: meta.directorText,
      releaseYear: meta.releaseYear,
      runtimeMinutes: meta.runtimeMinutes,
      overview: meta.overview,
      posterUrl: meta.posterUrl,
      tmdbTitleCandidates: meta.tmdbTitleCandidates,
      preferMovieTitleForDisplay: meta.preferMovieTitleForDisplay,
      matchedMovieTitleHint: meta.matchedMovieTitleHint,
    })
  }

  return rows
}

function dedupeShowtimes(rows: ScrapedShowtime[]): ScrapedShowtime[] {
  return dedupeByKeys(rows, (row) => [
    [
      row.movieTitle,
      row.shownTitle || '',
      row.startTimeRaw,
      row.ticketUrl || '',
      row.sourceShowtimeId || '',
    ].join('|'),
  ])
}

async function scrapeBamDetailPage(entry: BamListEntry): Promise<ScrapedShowtime[]> {
  const detailUrl = entry.detailUrl
  const html = await fetchHtml(detailUrl)
  const $ = cheerio.load(html)
  const meta = extractDetailBasics($, detailUrl, entry.posterUrl)

  let rows = parseJsonLdShowtimes($, detailUrl, meta)

  if (rows.length === 0) {
    const performanceRows = await fetchPerformanceRows(html)
    rows = parsePerformanceApiShowtimes(performanceRows, detailUrl, meta)
  }

  return dedupeShowtimes(rows)
}

export async function scrapeBamShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const html = await fetchHtml(config.sourceUrl)
  const entries = parseBamListPage(html, config.sourceUrl)

  const settled = await Promise.allSettled(
    entries.map((entry) => scrapeBamDetailPage(entry))
  )

  const rows: ScrapedShowtime[] = []

  for (const result of settled) {
    if (result.status !== 'fulfilled') {
      console.error('[bam] detail parse failed:', result.reason)
      continue
    }

    rows.push(...result.value)
  }

  return dedupeShowtimes(rows)
}
