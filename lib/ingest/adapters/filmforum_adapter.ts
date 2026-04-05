// lib/ingest/adapters/filmforum_adapter.ts

import * as cheerio from 'cheerio'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import {
  normalizeWhitespace,
  cleanPossessivePrefixTitle,
} from '../core/text'
import { buildAbsoluteUrl } from '../core/url'
import {
  parseYear,
  parseRuntimeMinutes,
  parseFormat,
} from '../core/meta'
import { parseShowtime, formatShowtimeRaw } from '../core/datetime'

type DetailMovieInfo = {
  title?: string
  shownTitle?: string
  relatedMovieTitle?: string
  relatedDetailUrl?: string
  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  rawFormat?: string
  overview?: string
  posterUrl?: string
}

type FilmForumEntry = {
  movieTitle: string
  shownTitle?: string
  detailUrl?: string
  ticketUrl?: string
  posterUrl?: string
  fallbackShowtimes?: {
    startTimeRaw: string
    rawFormat?: string
  }[]
}

function getFilmForumUrls(sourceUrl: string) {
  const root = new URL(sourceUrl)
  const origin = root.origin

  return {
    nowPlayingUrl: `${origin}/now_playing`,
    comingSoonUrl: `${origin}/coming_soon`,
  }
}

type FilmForumTitleFields = {
  movieTitle: string
  shownTitle?: string
}

const filmForumDetailPageCache = new Map<string, Promise<DetailMovieInfo>>()
const DIRECTORS_CUT_SUFFIX_PATTERN =
  /^(.*?)(?::\s*(?:THE\s+)?DIRECTOR[’']S\s+CUT)$/i

function cleanTitleText(text: string): string {
  if (!text) return ''

  let s = normalizeWhitespace(text)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim()

  s = cleanPossessivePrefixTitle(s)

  s = s
    .replace(/^AGNÈS VARDA:\s*A COMPREHENSIVE RETROSPECTIVE\s*/i, '')
    .replace(/^Satyajit Ray:\s*/i, '')
    .replace(/^Satyajit Ray’s\s*/i, '')
    .replace(/^Pixar’s\s*/i, '')
    .replace(/^Tim Burton’s\s*/i, '')
    .replace(/^Spike Lee’s\s*/i, '')
    .replace(/^Hayao Miyazaki’s\s*/i, '')
    .replace(/^Elvira Notari’s\s*/i, '')
    .replace(/^Harold Lloyd in\s*/i, '')
    .trim()

  return s
}

function normalizeComparableTitle(value?: string | null): string {
  return cleanTitleText(value || '').toLowerCase()
}

function pickDistinctShownTitle(
  movieTitle: string,
  ...candidates: Array<string | undefined>
): string | undefined {
  const normalizedMovieTitle = normalizeComparableTitle(movieTitle)

  for (const candidate of candidates) {
    const cleaned = cleanTitleText(candidate || '')
    if (!cleaned) continue
    if (normalizeComparableTitle(cleaned) === normalizedMovieTitle) continue
    return cleaned
  }

  return undefined
}

function splitFilmForumEditionTitle(value?: string | null): FilmForumTitleFields {
  const cleaned = cleanTitleText(value || '')
  if (!cleaned) {
    return {
      movieTitle: '',
    }
  }

  const match = cleaned.match(DIRECTORS_CUT_SUFFIX_PATTERN)
  if (!match?.[1]) {
    return {
      movieTitle: cleaned,
    }
  }

  const movieTitle = cleanTitleText(match[1])
  if (!movieTitle) {
    return {
      movieTitle: cleaned,
    }
  }

  return {
    movieTitle,
    shownTitle: cleaned,
  }
}

export function resolveFilmForumTitleFields(input: {
  movieTitle?: string | null
  shownTitle?: string | null
  relatedMovieTitle?: string | null
}): FilmForumTitleFields {
  const primaryTitle = cleanTitleText(input.movieTitle || '')
  const shownTitle = cleanTitleText(input.shownTitle || '')
  const relatedMovieTitle = cleanTitleText(input.relatedMovieTitle || '')
  const primaryEdition = splitFilmForumEditionTitle(primaryTitle)
  const shownEdition = splitFilmForumEditionTitle(shownTitle)

  let movieTitle =
    relatedMovieTitle ||
    primaryEdition.movieTitle ||
    shownEdition.movieTitle ||
    primaryTitle ||
    shownTitle

  if (!movieTitle) {
    return {
      movieTitle: '',
    }
  }

  const normalizedPrimaryTitle = normalizeComparableTitle(primaryTitle)
  const normalizedShownTitle = normalizeComparableTitle(shownTitle)

  if (!relatedMovieTitle && normalizedPrimaryTitle && normalizedShownTitle) {
    if (
      normalizedShownTitle.startsWith(`${normalizedPrimaryTitle} `) &&
      normalizedShownTitle !== normalizedPrimaryTitle
    ) {
      movieTitle = primaryTitle
    } else if (
      normalizedPrimaryTitle.startsWith(`${normalizedShownTitle} `) &&
      normalizedPrimaryTitle !== normalizedShownTitle
    ) {
      movieTitle = shownTitle
    }
  }

  const distinctShownTitle = pickDistinctShownTitle(
    movieTitle,
    shownTitle,
    primaryTitle,
    primaryEdition.shownTitle,
    shownEdition.shownTitle
  )

  return {
    movieTitle,
    ...(distinctShownTitle ? { shownTitle: distinctShownTitle } : {}),
  }
}

function parseFilmForumMetaText(metaText: string): {
  releaseYear?: number
  runtimeMinutes?: number
  rawFormat?: string
} {
  const cleaned = normalizeWhitespace(metaText)
  if (!cleaned) return {}

  return {
    releaseYear: parseYear(cleaned),
    runtimeMinutes: parseRuntimeMinutes(cleaned),
    rawFormat: parseFormat(cleaned),
  }
}

function extractDirectorFromDetailPage($: cheerio.CheerioAPI): string | undefined {
  const texts = $('p, div, span, li, strong, b')
    .map((_, el) => normalizeWhitespace($(el).text()))
    .get()
    .filter(Boolean)

  for (const text of texts) {
    const m =
      text.match(
        /DIRECTED BY\s+([^|•·]+?)(?=\s+(?:Starring|Cast|With|Written by|Approx|Country|Produced)|\s{2,}|$)/i
      ) ||
      text.match(/^Director:\s*(.+)$/i)

    if (m?.[1]) {
      const director = normalizeWhitespace(m[1])
        .replace(/\bwith\b.*$/i, '')
        .replace(/\bwritten by\b.*$/i, '')
        .replace(/\bstarring\b.*$/i, '')
        .trim()

      if (director) return director
    }
  }

  return undefined
}

function extractRelatedMovieLinkFromDetailPage(
  $: cheerio.CheerioAPI,
  pageUrl: string
): Pick<DetailMovieInfo, 'relatedMovieTitle' | 'relatedDetailUrl'> {
  const currentPathname = new URL(pageUrl).pathname

  const selectors = [
    '.full-listing .title a.blue-type[href*="/film/"]',
    '.column-listing .title a.blue-type[href*="/film/"]',
  ]

  for (const selector of selectors) {
    const links = $(selector).toArray()

    for (const link of links) {
      const href = buildAbsoluteUrl(pageUrl, $(link).attr('href'))
      if (!href) continue

      const pathname = new URL(href).pathname
      if (pathname === currentPathname) continue

      const relatedMovieTitle = cleanTitleText($(link).html() || $(link).text())
      if (!relatedMovieTitle) continue

      return {
        relatedMovieTitle,
        relatedDetailUrl: href,
      }
    }
  }

  return {}
}

async function scrapeFilmForumDetailPageUncached(url: string): Promise<DetailMovieInfo> {
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const rawTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('.main-title').first().html() ||
    $('h1').first().text() ||
    $('.entry-title').first().text()

  const title = cleanTitleText(rawTitle)

  const posterUrl =
    buildAbsoluteUrl(url, $('meta[property="og:image"]').attr('content')) ||
    buildAbsoluteUrl(url, $('.image-left img').first().attr('src')) ||
    buildAbsoluteUrl(url, $('img').first().attr('src'))

  const directorText = extractDirectorFromDetailPage($)

  let metaText: string | undefined

  $('p, strong, b, li').each((_, el) => {
    const text = normalizeWhitespace($(el).text())

    if (!metaText && /\b\d{4}\b/.test(text) && /MIN\.?/i.test(text)) {
      metaText = text
    }
  })

  const parsedMeta = parseFilmForumMetaText(metaText || '')
  const relatedMovie = extractRelatedMovieLinkFromDetailPage($, url)

  return {
    title: title || undefined,
    shownTitle: title || undefined,
    ...relatedMovie,
    directorText,
    releaseYear: parsedMeta.releaseYear,
    runtimeMinutes: parsedMeta.runtimeMinutes,
    rawFormat: parsedMeta.rawFormat,
    overview: undefined,
    posterUrl,
  }
}

async function scrapeFilmForumDetailPage(url: string): Promise<DetailMovieInfo> {
  const cached = filmForumDetailPageCache.get(url)
  if (cached) return cached

  const request = scrapeFilmForumDetailPageUncached(url).catch((error) => {
    filmForumDetailPageCache.delete(url)
    throw error
  })

  filmForumDetailPageCache.set(url, request)
  return request
}

async function resolveFilmForumDetailContext(detailUrl?: string): Promise<{
  pageInfo?: DetailMovieInfo
  metadataInfo?: DetailMovieInfo
}> {
  if (!detailUrl) return {}

  const pageInfo = await scrapeFilmForumDetailPage(detailUrl).catch(
    () => ({} as DetailMovieInfo)
  )

  if (!pageInfo.relatedDetailUrl || pageInfo.relatedDetailUrl === detailUrl) {
    return {
      pageInfo,
      metadataInfo: pageInfo,
    }
  }

  const metadataInfo = await scrapeFilmForumDetailPage(pageInfo.relatedDetailUrl).catch(
    () => pageInfo
  )

  return {
    pageInfo,
    metadataInfo,
  }
}

function hasConcreteDate(text: string): boolean {
  const cleaned = normalizeWhitespace(text)

  return /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Z][a-z]+\s+\d{1,2}(?:,?\s+\d{4})?/i.test(
    cleaned
  )
}

function extractTimesFromPiece(piece: string): string[] {
  const matches = piece.match(/\b\d{1,2}:\d{2}\b(?:\s*(?:AM|PM))?/gi)
  return matches ? matches.map((x) => normalizeWhitespace(x)) : []
}

function normalizeFilmForumTimeText(timeText: string): string {
  const cleaned = normalizeWhitespace(timeText).replace(/[*†‡]+$/g, '').trim()
  if (!cleaned || /\b(?:AM|PM)\b/i.test(cleaned)) return cleaned

  const match = cleaned.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return cleaned

  const hour = Number(match[1])
  if (hour < 1 || hour > 12) return cleaned

  // Film Forum publishes unlabeled 12-hour times on its public pages.
  // Treat 1-9 as afternoon/evening, 10-11 as morning, and 12 as noon.
  const meridiem = hour >= 10 && hour <= 11 ? 'AM' : 'PM'
  return `${cleaned} ${meridiem}`
}

function normalizeFallbackText(detailsText: string): string[] {
  return detailsText
    .replace(/\u00a0/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/\s+\|\s+/g, '\n')
    .split(/\n+/)
    .map((s) => normalizeWhitespace(s.replace(/<[^>]+>/g, ' ')))
    .filter(Boolean)
}

function buildFilmForumStartTimeRaw(dateText: string, timeText: string): string {
  const normalizedTimeText = normalizeFilmForumTimeText(timeText)
  const parsed = parseShowtime({
    dateText,
    timeText: normalizedTimeText,
  })

  if (parsed) {
    return formatShowtimeRaw(parsed)
  }

  return `${normalizeWhitespace(dateText)} ${normalizedTimeText}`.trim()
}

function parseFallbackDetailsText(detailsText: string): {
  startTimeRaw: string
  rawFormat?: string
}[] {
  const pieces = normalizeFallbackText(detailsText)
  const rows: { startTimeRaw: string; rawFormat?: string }[] = []

  let currentDate = ''

  for (const piece of pieces) {
    if (hasConcreteDate(piece)) {
      currentDate = piece
      continue
    }

    if (!currentDate) continue

    const rawFormat = parseFormat(piece)
    const times = extractTimesFromPiece(piece)

    for (const timeText of times) {
      rows.push({
        startTimeRaw: buildFilmForumStartTimeRaw(currentDate, timeText),
        rawFormat,
      })
    }
  }

  return rows
}

function collectDirectFilmEntries(
  $: cheerio.CheerioAPI,
  pageUrl: string
): FilmForumEntry[] {
  const rows: FilmForumEntry[] = []
  const seen = new Set<string>()

  $('.column-listing, .full-listing').each((_, el) => {
    const root = $(el)
    const titleLink = root.find('.title a.blue-type').first()
    if (!titleLink.length) return

    const movieTitle = cleanTitleText(titleLink.text())
    if (!movieTitle) return

    const detailUrl = buildAbsoluteUrl(pageUrl, titleLink.attr('href'))
    const ticketUrl = buildAbsoluteUrl(
      pageUrl,
      root.find('a.button[href*="my.filmforum.org"]').first().attr('href')
    )

    const posterUrl =
      buildAbsoluteUrl(pageUrl, root.find('img').first().attr('src')) ||
      buildAbsoluteUrl(pageUrl, root.find('img').first().attr('data-src'))

    const detailsHtml = root.find('.details').first().html() || ''
    const fallbackShowtimes = parseFallbackDetailsText(detailsHtml)

    const key = `${movieTitle}|${detailUrl || ''}|${ticketUrl || ''}`
    if (seen.has(key)) return
    seen.add(key)

    rows.push({
      movieTitle,
      shownTitle: movieTitle,
      detailUrl,
      ticketUrl,
      posterUrl,
      fallbackShowtimes,
    })
  })

  return rows
}

function collectSeriesUrls($: cheerio.CheerioAPI, pageUrl: string): string[] {
  const seen = new Set<string>()
  const urls: string[] = []

  $('a.blue-type[href*="/series/"]').each((_, el) => {
    const href = $(el).attr('href')
    const abs = buildAbsoluteUrl(pageUrl, href)

    if (abs && !seen.has(abs)) {
      seen.add(abs)
      urls.push(abs)
    }
  })

  return urls
}

async function collectEntriesFromSeriesPage(seriesUrl: string): Promise<FilmForumEntry[]> {
  const html = await fetchHtml(seriesUrl)
  const $ = cheerio.load(html)
  return collectDirectFilmEntries($, seriesUrl)
}

async function scrapeTicketPageShowtimes(params: {
  movieTitle: string
  shownTitle?: string
  ticketUrl: string
  detailUrl?: string
  fallbackPosterUrl?: string
}): Promise<ScrapedShowtime[]> {
  const html = await fetchHtml(params.ticketUrl)
  const $ = cheerio.load(html)

  const { pageInfo, metadataInfo } = await resolveFilmForumDetailContext(params.detailUrl)

  const rows: ScrapedShowtime[] = []

  $('.tn-prod-list-item__perf-list-item').each((_, el) => {
    const item = $(el)
    const statusText = item.find('.tn-prod-list-item__perf-status').text()
    const isSoldOut = /Sold Out/i.test(statusText)

    const dateText = normalizeWhitespace(
      item.find('.tn-prod-list-item__perf-date').first().text()
    )
    const timeText = normalizeWhitespace(
      item.find('.tn-prod-list-item__perf-time').first().text()
    )
    const perfTitle = cleanTitleText(
      item.find('.tn-performance-title').first().text()
    )

    const href = item.find('a.tn-prod-list-item__perf-anchor').first().attr('href')
    const purchaseUrl = buildAbsoluteUrl(params.ticketUrl, href) || params.ticketUrl
    const sourceShowtimeId = item.attr('data-tn-performance-no') || undefined

    if (!dateText || !timeText) return

    const titles = resolveFilmForumTitleFields({
      movieTitle: metadataInfo?.title || pageInfo?.relatedMovieTitle || params.movieTitle,
      shownTitle: perfTitle || pageInfo?.shownTitle || params.shownTitle,
      relatedMovieTitle: pageInfo?.relatedMovieTitle || metadataInfo?.title,
    })

    if (!titles.movieTitle) return

    rows.push({
      movieTitle: titles.movieTitle,
      shownTitle: titles.shownTitle,
      startTimeRaw: buildFilmForumStartTimeRaw(dateText, timeText),
      ticketUrl: isSoldOut ? undefined : purchaseUrl,
      sourceUrl: params.detailUrl || params.ticketUrl,
      rawFormat: metadataInfo?.rawFormat,
      sourceShowtimeId,
      directorText: metadataInfo?.directorText,
      releaseYear: metadataInfo?.releaseYear,
      runtimeMinutes: metadataInfo?.runtimeMinutes,
      overview: undefined,
      posterUrl: metadataInfo?.posterUrl || pageInfo?.posterUrl || params.fallbackPosterUrl,
    })
  })

  return rows
}

async function buildFallbackRowsFromEntry(entry: FilmForumEntry): Promise<ScrapedShowtime[]> {
  if (!entry.fallbackShowtimes?.length) return []

  const { pageInfo, metadataInfo } = await resolveFilmForumDetailContext(entry.detailUrl)
  const titles = resolveFilmForumTitleFields({
    movieTitle: metadataInfo?.title || pageInfo?.relatedMovieTitle || entry.movieTitle,
    shownTitle: pageInfo?.shownTitle || entry.shownTitle,
    relatedMovieTitle: pageInfo?.relatedMovieTitle || metadataInfo?.title,
  })

  return entry.fallbackShowtimes.map((show) => ({
    movieTitle: titles.movieTitle,
    shownTitle: titles.shownTitle,
    startTimeRaw: show.startTimeRaw,
    ticketUrl: entry.ticketUrl,
    sourceUrl: entry.detailUrl || entry.ticketUrl,
    rawFormat: show.rawFormat || metadataInfo?.rawFormat,
    directorText: metadataInfo?.directorText,
    releaseYear: metadataInfo?.releaseYear,
    runtimeMinutes: metadataInfo?.runtimeMinutes,
    overview: undefined,
    posterUrl: metadataInfo?.posterUrl || pageInfo?.posterUrl || entry.posterUrl,
  }))
}

function scoreFilmForumRow(row: ScrapedShowtime): number {
  let score = 0

  if (pickDistinctShownTitle(row.movieTitle, row.shownTitle)) {
    score += 5
  }

  if (row.sourceUrl?.includes('/events/event/')) {
    score += 3
  }

  if (row.ticketUrl && !row.ticketUrl.includes('/events/')) {
    score += 2
  }

  if (row.sourceShowtimeId) {
    score += 1
  }

  return score
}

function mergeFilmForumRows(
  existing: ScrapedShowtime,
  incoming: ScrapedShowtime
): ScrapedShowtime {
  const primary =
    scoreFilmForumRow(incoming) > scoreFilmForumRow(existing) ? incoming : existing
  const secondary = primary === existing ? incoming : existing
  const movieTitle = cleanTitleText(primary.movieTitle || secondary.movieTitle)
  const shownTitle = pickDistinctShownTitle(
    movieTitle,
    primary.shownTitle,
    secondary.shownTitle
  )

  return {
    movieTitle,
    ...(shownTitle ? { shownTitle } : {}),
    startTimeRaw: primary.startTimeRaw || secondary.startTimeRaw,
    ticketUrl: primary.ticketUrl || secondary.ticketUrl,
    sourceUrl: primary.sourceUrl || secondary.sourceUrl,
    rawFormat: primary.rawFormat || secondary.rawFormat,
    sourceShowtimeId: primary.sourceShowtimeId || secondary.sourceShowtimeId,
    directorText: primary.directorText || secondary.directorText,
    releaseYear: primary.releaseYear || secondary.releaseYear,
    runtimeMinutes: primary.runtimeMinutes || secondary.runtimeMinutes,
    overview: primary.overview || secondary.overview,
    posterUrl: primary.posterUrl || secondary.posterUrl,
    tmdbTitleCandidates: primary.tmdbTitleCandidates || secondary.tmdbTitleCandidates,
    preferMovieTitleForDisplay:
      primary.preferMovieTitleForDisplay || secondary.preferMovieTitleForDisplay,
    matchedMovieTitleHint:
      primary.matchedMovieTitleHint || secondary.matchedMovieTitleHint,
  }
}

export function mergeFilmForumDuplicateRows(
  rows: ScrapedShowtime[]
): ScrapedShowtime[] {
  const mergedRows = new Map<string, ScrapedShowtime>()

  for (const row of rows) {
    const normalizedTitles = resolveFilmForumTitleFields({
      movieTitle: row.movieTitle,
      shownTitle: row.shownTitle,
    })
    const normalizedRow: ScrapedShowtime = {
      ...row,
      movieTitle: normalizedTitles.movieTitle || row.movieTitle,
      shownTitle: normalizedTitles.shownTitle,
    }
    const key = [
      normalizeComparableTitle(normalizedRow.movieTitle),
      normalizeWhitespace(normalizedRow.startTimeRaw),
      normalizeComparableTitle(normalizedRow.rawFormat),
    ].join('|')
    const existing = mergedRows.get(key)

    mergedRows.set(
      key,
      existing ? mergeFilmForumRows(existing, normalizedRow) : normalizedRow
    )
  }

  return [...mergedRows.values()]
}

async function scrapeEntriesFromPage(pageUrl: string): Promise<FilmForumEntry[]> {
  const html = await fetchHtml(pageUrl)
  const $ = cheerio.load(html)

  const directEntries = collectDirectFilmEntries($, pageUrl)
  const seriesUrls = collectSeriesUrls($, pageUrl)

  const allEntries: FilmForumEntry[] = [...directEntries]
  const seen = new Set(
    allEntries.map((e) => `${e.movieTitle}|${e.detailUrl || ''}|${e.ticketUrl || ''}`)
  )

  for (const seriesUrl of seriesUrls) {
    try {
      const seriesEntries = await collectEntriesFromSeriesPage(seriesUrl)

      for (const entry of seriesEntries) {
        const key = `${entry.movieTitle}|${entry.detailUrl || ''}|${entry.ticketUrl || ''}`

        if (!seen.has(key)) {
          seen.add(key)
          allEntries.push(entry)
        }
      }
    } catch {
      continue
    }
  }

  return allEntries
}

export async function scrapeFilmForumShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const { nowPlayingUrl, comingSoonUrl } = getFilmForumUrls(config.sourceUrl)
  const allEntries: FilmForumEntry[] = []
  const allRows: ScrapedShowtime[] = []
  const seenEntries = new Set<string>()
  const seenRows = new Set<string>()

  for (const pageUrl of [nowPlayingUrl, comingSoonUrl]) {
    try {
      const entries = await scrapeEntriesFromPage(pageUrl)

      for (const entry of entries) {
        const key = `${entry.movieTitle}|${entry.detailUrl || ''}|${entry.ticketUrl || ''}`

        if (!seenEntries.has(key)) {
          seenEntries.add(key)
          allEntries.push(entry)
        }
      }
    } catch {
      continue
    }
  }

  for (const entry of allEntries) {
    try {
      let rows: ScrapedShowtime[] = []

      if (entry.ticketUrl) {
        rows = await scrapeTicketPageShowtimes({
          movieTitle: entry.movieTitle,
          shownTitle: entry.shownTitle,
          ticketUrl: entry.ticketUrl,
          detailUrl: entry.detailUrl,
          fallbackPosterUrl: entry.posterUrl,
        })
      }

      if (!rows.length) {
        rows = await buildFallbackRowsFromEntry(entry)
      }

      for (const row of rows) {
        const key = `${row.movieTitle}|${row.startTimeRaw}|${row.ticketUrl || ''}|${row.sourceShowtimeId || ''}`

        if (!seenRows.has(key)) {
          seenRows.add(key)
          allRows.push(row)
        }
      }
    } catch {
      continue
    }
  }

  return mergeFilmForumDuplicateRows(allRows)
}
