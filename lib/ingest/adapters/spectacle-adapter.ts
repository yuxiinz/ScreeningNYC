// lib/ingest/adapters/spectacle-adapter.ts

import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { DateTime } from 'luxon'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { cleanText, decodeHtmlEntities, normalizeWhitespace } from '../core/text'
import { buildAbsoluteUrl } from '../core/url'
import { parseRuntimeMinutes, parseYear } from '../core/meta'
import { buildShowtimeRaw, parseShowtime } from '../core/datetime'
import { parseScreeningTitle } from '../core/screening-title'
import { APP_TIMEZONE } from '../../timezone'

const SPECTACLE_BASE_URL = 'https://www.spectacletheater.com'
const DEFAULT_SCHEDULE_URL = 'https://www.spectacletheater.com/spex-rolling.html'

type SpectacleScheduleEntry = {
  shownTitle: string
  sourceUrl: string
  baseUrl: string
  anchorId?: string
  dateText: string
  timeText: string
  posterUrl?: string
}

type ParsedSpectacleBlock = {
  index: number
  html: string
  text: string
  lines: string[]
  anchorIds: string[]
  titleCandidate?: string
  posterUrl?: string
  ticketUrl?: string
}

type SpectacleSection = {
  title?: string
  movieTitle?: string
  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  overview?: string
  posterUrl?: string
  ticketUrl?: string
  tmdbTitleCandidates?: string[]
  preferMovieTitleForDisplay?: boolean
  anchorIds: string[]
  comparableTitles: string[]
}

type SpectacleDetailParse = {
  defaultSection?: SpectacleSection
  sections: SpectacleSection[]
  byAnchorId: Map<string, SpectacleSection>
}

function absoluteUrl(value?: string | null): string | undefined {
  return buildAbsoluteUrl(SPECTACLE_BASE_URL, value)
}

function buildScheduleUrl(sourceUrl?: string): string {
  const cleaned = cleanText(sourceUrl)
  if (!cleaned) return DEFAULT_SCHEDULE_URL

  if (cleaned.includes('spex-rolling.html')) {
    return cleaned
  }

  try {
    return new URL('/spex-rolling.html', cleaned).toString()
  } catch {
    return DEFAULT_SCHEDULE_URL
  }
}

function splitSourceUrl(sourceUrl: string): {
  baseUrl: string
  anchorId?: string
} {
  try {
    const url = new URL(sourceUrl)
    const anchorId = cleanText(url.hash.replace(/^#/, '')) || undefined
    url.hash = ''

    return {
      baseUrl: url.toString(),
      anchorId,
    }
  } catch {
    return { baseUrl: sourceUrl }
  }
}

function htmlToLines(html?: string | null): string[] {
  if (!html) return []

  const text = decodeHtmlEntities(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')

  return text
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean)
}

function normalizeComparableTitle(value?: string | null): string {
  return cleanText(decodeHtmlEntities(value))
    .replace(/\((?:w\/)?\s*q\s*&?\s*a[^)]*\)/gi, '')
    .replace(/\b(?:w\/)?\s*q\s*&?\s*a\b/gi, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function looksLikeScheduleLine(line?: string): boolean {
  const cleaned = cleanText(line)
  if (!cleaned) return false

  return /^(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/i.test(cleaned)
}

function isTicketLine(line?: string): boolean {
  const cleaned = cleanText(line).toLowerCase()
  if (!cleaned) return false

  return cleaned.includes('ticket')
}

function looksLikeMetaLine(line?: string): boolean {
  const cleaned = cleanText(line)
  if (!cleaned) return false

  if (/^dirs?\.?/i.test(cleaned)) return true
  if (parseYear(cleaned) && /,\s*(18|19|20)\d{2}\.?$/i.test(cleaned)) return true
  if (parseRuntimeMinutes(cleaned)) return true
  if (looksLikeScheduleLine(cleaned)) return true
  if (/^in\s+[a-z]/i.test(cleaned)) return true

  return false
}

function extractDirectorText(line?: string): string | undefined {
  const cleaned = cleanText(line)
  if (!cleaned) return undefined

  const explicitMatch = cleaned.match(
    /^Dirs?\.?\s+(.+?)(?:[.,]\s*(?:18|19|20)\d{2}\.?|$)/i
  )

  if (explicitMatch?.[1]) {
    return cleanText(explicitMatch[1]).replace(/[.,;:]\s*$/, '')
  }

  const implicitMatch = cleaned.match(/^(.+?),\s*(?:18|19|20)\d{2}\.?$/)
  if (implicitMatch?.[1]) {
    const candidate = cleanText(implicitMatch[1])

    if (
      candidate &&
      !/(?:united states|japan|mexico|italy|spain|france|germany|canada|england|uk|in english|minutes?|min\.?$)/i.test(
        candidate
      )
    ) {
      return candidate
    }
  }

  return undefined
}

function extractTitleCandidate(block: ParsedSpectacleBlock): string | undefined {
  if (!block.lines.length) return undefined
  if (!/(<strong|<b|<h\d)/i.test(block.html)) return undefined

  const firstLine = cleanText(block.lines[0])
  if (!firstLine || firstLine.length > 180) return undefined
  if (looksLikeScheduleLine(firstLine) || isTicketLine(firstLine)) return undefined
  if (/^dirs?\.?/i.test(firstLine)) return undefined
  if (/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/i.test(firstLine)) return undefined
  if (/^(?:every|first come|\$)/i.test(firstLine)) return undefined
  if (/^(?:since|filmed in|content warning|in english|posted on)\b/i.test(firstLine)) {
    return undefined
  }

  return cleanText(
    firstLine.replace(/\(\d+\s*(?:minutes?|mins?|min\.?)\)$/i, '')
  )
}

function extractHeaderDates($: cheerio.CheerioAPI): string[] {
  return $('table.spexcal tr')
    .first()
    .find('th')
    .map((_, thEl) => {
      const th = $(thEl)
      const html = th.html() || ''
      const isoDate = html.match(/<!--\s*(\d{4}-\d{2}-\d{2})\s*-->/)?.[1]

      if (!isoDate) return ''

      const date = DateTime.fromISO(isoDate, { zone: APP_TIMEZONE })
      return date.isValid ? date.toFormat('cccc, LLLL d, yyyy') : ''
    })
    .get()
}

function parseSchedulePage(html: string): SpectacleScheduleEntry[] {
  const $ = cheerio.load(html)
  const dateTexts = extractHeaderDates($)
  const rows: SpectacleScheduleEntry[] = []

  $('table.spexcal tr')
    .slice(1)
    .each((_, rowEl) => {
      const row = $(rowEl)

      row.find('td').each((columnIndex, cellEl) => {
        const cell = row.find(cellEl)
        const anchor = cell.find('a[href]').first()
        const dateText = dateTexts[columnIndex]

        if (!anchor.length || !dateText) return

        const sourceUrl = absoluteUrl(anchor.attr('href'))
        if (!sourceUrl) return

        const img = anchor.find('img').first()
        const shownTitle = cleanText(
          decodeHtmlEntities(
            img.attr('title') || img.attr('alt') || anchor.text()
          )
        )
        const timeText = cleanText(anchor.clone().find('img').remove().end().text())
        if (!shownTitle || !timeText) return

        const split = splitSourceUrl(sourceUrl)

        rows.push({
          shownTitle,
          sourceUrl,
          baseUrl: split.baseUrl,
          anchorId: split.anchorId,
          dateText,
          timeText,
          posterUrl: absoluteUrl(img.attr('src')),
        })
      })
    })

  return rows
}

function extractAnchorIds(
  $: cheerio.CheerioAPI,
  block: cheerio.Cheerio<AnyNode>,
  knownAnchorIds: Set<string>
): string[] {
  const ids = new Set<string>()

  const addValue = (value?: string | null) => {
    const cleaned = cleanText(value)
    if (cleaned && knownAnchorIds.has(cleaned)) {
      ids.add(cleaned)
    }
  }

  addValue(block.attr('id'))
  addValue(block.attr('name'))

  block.find('[id], [name], a[name]').each((_, el) => {
    const node = $(el)
    addValue(node.attr('id'))
    addValue(node.attr('name'))
  })

  return [...ids]
}

function parseContentBlocks(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  knownAnchorIds: Set<string>
): ParsedSpectacleBlock[] {
  const content = $('.entry-content').first()

  return content
    .children()
    .toArray()
    .map((el, index) => {
      const block = $(el)
      const html = $.html(block) || ''
      const text = cleanText(decodeHtmlEntities(block.text()))
      const lines = htmlToLines(block.html())
      const ticketAnchor = block
        .find('a[href]')
        .filter((_, anchorEl) => {
          const anchor = $(anchorEl)
          return /ticket/i.test(cleanText(anchor.text()))
        })
        .first()

      const parsedBlock: ParsedSpectacleBlock = {
        index,
        html,
        text,
        lines,
        anchorIds: extractAnchorIds($, block, knownAnchorIds),
        posterUrl: absoluteUrl(block.find('img').first().attr('src')),
        ticketUrl: ticketAnchor.length
          ? buildAbsoluteUrl(baseUrl, ticketAnchor.attr('href'))
          : undefined,
      }

      parsedBlock.titleCandidate = extractTitleCandidate(parsedBlock)
      return parsedBlock
    })
    .filter((block) => block.html && (block.text || block.posterUrl || block.anchorIds.length))
}

function sameAnchorSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false

  const sortedA = [...a].sort()
  const sortedB = [...b].sort()

  return sortedA.every((value, index) => value === sortedB[index])
}

function buildSectionStarts(blocks: ParsedSpectacleBlock[]): number[] {
  const starts = new Set<number>()
  let currentAnchorIds: string[] = []

  for (const block of blocks) {
    if (!block.anchorIds.length) continue

    if (!sameAnchorSet(block.anchorIds, currentAnchorIds)) {
      starts.add(block.index)
      currentAnchorIds = block.anchorIds
    }
  }

  for (const block of blocks) {
    if (!block.titleCandidate) continue

    const hasNearbyStart = [...starts].some(
      (startIndex) => Math.abs(startIndex - block.index) <= 3
    )

    if (!hasNearbyStart) {
      starts.add(block.index)
    }
  }

  if (!starts.size && blocks.length) {
    starts.add(blocks[0].index)
  }

  return [...starts].sort((a, b) => a - b)
}

function buildComparableTitles(
  title?: string,
  movieTitle?: string,
  extra?: Array<string | undefined>
): string[] {
  return [...new Set([title, movieTitle, ...(extra || [])].map((value) => normalizeComparableTitle(value)).filter(Boolean))]
}

function parseSection(
  blocks: ParsedSpectacleBlock[],
  fallbackTitle?: string,
  fallbackPosterUrl?: string
): SpectacleSection {
  const titleBlocks = blocks.filter((block) => block.titleCandidate)
  const scheduleBoundary =
    blocks.find(
      (block) =>
        block.ticketUrl ||
        block.lines.some((line) => looksLikeScheduleLine(line))
    )?.index ?? Number.POSITIVE_INFINITY
  const leadingTitleBlocks = titleBlocks.filter(
    (block) => block.index < scheduleBoundary
  )
  const sectionTitle =
    leadingTitleBlocks.length > 1
      ? leadingTitleBlocks
          .map((block) => cleanText(block.titleCandidate))
          .filter(Boolean)
          .join(' + ')
      : titleBlocks[0]?.titleCandidate || fallbackTitle
  const titleParse = parseScreeningTitle(sectionTitle)
  const movieTitle = titleParse.title || cleanText(sectionTitle)

  const directorTexts: string[] = []
  const releaseYears: number[] = []
  const runtimeCandidates: number[] = []
  let ticketUrl: string | undefined
  let posterUrl = fallbackPosterUrl
  const aliasTitles: string[] = []

  for (const block of blocks) {
    if (!posterUrl && block.posterUrl) {
      posterUrl = block.posterUrl
    }

    if (!ticketUrl && block.ticketUrl) {
      ticketUrl = block.ticketUrl
    }

    for (const line of block.lines) {
      const directorText = extractDirectorText(line)
      if (directorText && !directorTexts.includes(directorText)) {
        directorTexts.push(directorText)
      }

      const releaseYear = parseYear(line)
      if (releaseYear && !releaseYears.includes(releaseYear)) {
        releaseYears.push(releaseYear)
      }

      const runtimeMinutes = parseRuntimeMinutes(line)
      if (runtimeMinutes && !runtimeCandidates.includes(runtimeMinutes)) {
        runtimeCandidates.push(runtimeMinutes)
      }

      const aliasMatch = cleanText(line).match(/^aka\s+(.+)$/i)
      if (aliasMatch?.[1]) {
        aliasTitles.push(cleanText(aliasMatch[1]))
      }
    }
  }

  const overview = cleanText(
    blocks
      .filter((block) => {
        if (!block.text || block.text.length < 60) return false
        if (block.titleCandidate) return false
        if (block.ticketUrl) return false
        if (/<em\b/i.test(block.html) && block.text.length < 400) return false
        if (block.lines.some((line) => looksLikeScheduleLine(line) || isTicketLine(line))) {
          return false
        }
        if (block.lines.length <= 4 && block.lines.every((line) => looksLikeMetaLine(line))) {
          return false
        }

        return true
      })
      .map((block) => block.text)
      .join('\n\n')
  ) || undefined

  return {
    title: cleanText(sectionTitle) || undefined,
    movieTitle: movieTitle || undefined,
    directorText: directorTexts.length ? directorTexts.join(' / ') : undefined,
    releaseYear:
      titleParse.releaseYear ||
      (releaseYears.length === 1 ? releaseYears[0] : undefined),
    runtimeMinutes:
      leadingTitleBlocks.length > 1 && runtimeCandidates.length > 1
        ? runtimeCandidates.reduce((sum, value) => sum + value, 0)
        : runtimeCandidates[0],
    overview,
    posterUrl,
    ticketUrl,
    tmdbTitleCandidates: titleParse.tmdbTitleCandidates,
    preferMovieTitleForDisplay: titleParse.preferMovieTitleForDisplay || undefined,
    anchorIds: [...new Set(blocks.flatMap((block) => block.anchorIds))],
    comparableTitles: buildComparableTitles(
      sectionTitle,
      movieTitle,
      aliasTitles
    ),
  }
}

function parseDetailPage(
  html: string,
  baseUrl: string,
  knownAnchorIds: Set<string>
): SpectacleDetailParse {
  const $ = cheerio.load(html)
  const pageTitle = cleanText($('.entry-title').first().text()) || undefined
  const pagePosterUrl =
    absoluteUrl($("meta[property='og:image']").attr('content')) ||
    absoluteUrl($('.entry-content img').first().attr('src'))

  const blocks = parseContentBlocks($, baseUrl, knownAnchorIds)
  if (!blocks.length) {
    return {
      sections: [],
      byAnchorId: new Map(),
    }
  }

  const starts = buildSectionStarts(blocks)
  const sections: SpectacleSection[] = []

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index]
    const end = starts[index + 1] ?? blocks.length
    const sectionBlocks = blocks.filter(
      (block) => block.index >= start && block.index < end
    )

    if (!sectionBlocks.length) continue

    sections.push(parseSection(sectionBlocks, pageTitle, pagePosterUrl))
  }

  if (!sections.length) {
    sections.push(parseSection(blocks, pageTitle, pagePosterUrl))
  }

  const byAnchorId = new Map<string, SpectacleSection>()

  for (const section of sections) {
    for (const anchorId of section.anchorIds) {
      byAnchorId.set(anchorId, section)
    }
  }

  return {
    defaultSection: sections.length === 1 ? sections[0] : undefined,
    sections,
    byAnchorId,
  }
}

function findSectionByTitle(
  sections: SpectacleSection[],
  shownTitle: string
): SpectacleSection | undefined {
  const normalizedShownTitle = normalizeComparableTitle(shownTitle)
  if (!normalizedShownTitle) return undefined

  const exact = sections.find((section) =>
    section.comparableTitles.includes(normalizedShownTitle)
  )

  if (exact) return exact

  return sections.find((section) =>
    section.comparableTitles.some((candidate) => {
      if (!candidate) return false
      if (candidate.length < 8 && normalizedShownTitle.length < 8) return false

      return (
        candidate.includes(normalizedShownTitle) ||
        normalizedShownTitle.includes(candidate)
      )
    })
  )
}

function buildSourceShowtimeId(
  sourceUrl: string,
  dateText: string,
  timeText: string
): string {
  const parsed = parseShowtime({
    dateText,
    timeText,
  })

  if (parsed) {
    return `${sourceUrl}__${parsed.toISOString()}`
  }

  return `${sourceUrl}__${normalizeWhitespace(dateText)}__${normalizeWhitespace(timeText)}`
}

export async function scrapeSpectacleShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const scheduleUrl = buildScheduleUrl(config.sourceUrl)
  const scheduleHtml = await fetchHtml(scheduleUrl)
  const scheduleRows = parseSchedulePage(scheduleHtml)
  const anchorIndex = new Map<string, Set<string>>()

  for (const row of scheduleRows) {
    if (!row.anchorId) continue

    const ids = anchorIndex.get(row.baseUrl) || new Set<string>()
    ids.add(row.anchorId)
    anchorIndex.set(row.baseUrl, ids)
  }

  const detailCache = new Map<string, SpectacleDetailParse | null>()
  const rows: ScrapedShowtime[] = []
  const seen = new Set<string>()

  for (const item of scheduleRows) {
    let detail = detailCache.get(item.baseUrl)

    if (detail === undefined) {
      try {
        detail = parseDetailPage(
          await fetchHtml(item.baseUrl),
          item.baseUrl,
          anchorIndex.get(item.baseUrl) || new Set<string>()
        )
      } catch (error) {
        console.error('[spectacle] detail fetch failed:', item.baseUrl, error)
        detail = null
      }

      detailCache.set(item.baseUrl, detail)
    }

    const section =
      (item.anchorId ? detail?.byAnchorId.get(item.anchorId) : undefined) ||
      findSectionByTitle(detail?.sections || [], item.shownTitle) ||
      (!item.anchorId ? detail?.defaultSection : undefined)

    const fallbackTitleParse = parseScreeningTitle(item.shownTitle)
    const movieTitle =
      section?.movieTitle ||
      fallbackTitleParse.title ||
      item.shownTitle
    const sourceShowtimeId = buildSourceShowtimeId(
      item.sourceUrl,
      item.dateText,
      item.timeText
    )

    if (seen.has(sourceShowtimeId)) {
      continue
    }

    seen.add(sourceShowtimeId)

    rows.push({
      movieTitle,
      shownTitle: item.shownTitle,
      startTimeRaw: buildShowtimeRaw(item.dateText, item.timeText),
      ticketUrl: section?.ticketUrl,
      sourceUrl: item.sourceUrl,
      sourceShowtimeId,
      directorText: section?.directorText,
      releaseYear: section?.releaseYear || fallbackTitleParse.releaseYear,
      runtimeMinutes: section?.runtimeMinutes,
      overview: section?.overview,
      posterUrl: section?.posterUrl || item.posterUrl,
      tmdbTitleCandidates:
        section?.tmdbTitleCandidates || fallbackTitleParse.tmdbTitleCandidates,
      preferMovieTitleForDisplay:
        section?.preferMovieTitleForDisplay ||
        fallbackTitleParse.preferMovieTitleForDisplay ||
        undefined,
      matchedMovieTitleHint: movieTitle !== item.shownTitle ? movieTitle : undefined,
    })
  }

  return rows
}
