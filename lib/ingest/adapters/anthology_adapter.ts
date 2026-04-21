// lib/ingest/adapters/anthology_adapter.ts

import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { DateTime } from 'luxon'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { APP_TIMEZONE } from '../../timezone'
import {
  cleanText,
  decodeHtmlEntities,
  normalizeLooseComparableText as normalizeComparableText,
  normalizeWhitespace,
} from '../core/text'
import { buildAbsoluteUrl } from '../core/url'
import { parseRuntimeMinutes, parseYear } from '../core/meta'
import { formatShowtimeRaw, parseShowtime } from '../core/datetime'

const ANTHOLOGY_BASE_URL = 'https://www.anthologyfilmarchives.org'
const VEEZI_BASE_URL = 'https://ticketing.uswest.veezi.com'
const DEFAULT_ANTHOLOGY_LIST_URL =
  'https://www.anthologyfilmarchives.org/film_screenings/calendar?view=list'
const DEFAULT_ANTHOLOGY_VEEZI_URL =
  'https://ticketing.uswest.veezi.com/sessions/?siteToken=bsrxtagjxmgh2qy0b6p646xdcr'
const DEFAULT_ANTHOLOGY_POSTER_URL = '/anthology-fallback-poster.svg'
const VEEZI_DEFAULT_POSTER_PATH = '/Content/Images/filmdefault.png'

type ParsedAnthologyMeta = {
  country?: string
  rawFormat?: string
  releaseYear?: number
  runtimeMinutes?: number
}

type EmbeddedFeature = {
  directorText?: string
  lineIndexes: number[]
  metaCount: number
  metaLine?: string
  title?: string
}

type IndexedRow = {
  index: number
  row: ScrapedShowtime
}

function absoluteAnthologyUrl(value?: string | null): string | undefined {
  return buildAbsoluteUrl(ANTHOLOGY_BASE_URL, value)
}

function absoluteVeeziUrl(value?: string | null): string | undefined {
  return buildAbsoluteUrl(VEEZI_BASE_URL, value)
}

function parseLinesFromHtml(html?: string | null): string[] {
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

function getCurrentDayText(
  $: cheerio.CheerioAPI,
  heading: cheerio.Cheerio<AnyNode>
): string {
  const clone = heading.clone()
  clone.find('*').remove()
  return cleanText(clone.text())
}

function getHeaderLines(details: cheerio.Cheerio<AnyNode>): string[] {
  const clone = details.clone()
  clone
    .find(
      '.share-toggle, .share-box, .series-note, .film-notes-link, .film-notes, p, form, input'
    )
    .remove()
  return parseLinesFromHtml(clone.html())
}

function getNoteLines(notes: cheerio.Cheerio<AnyNode>): string[] {
  const clone = notes.clone()
  clone.find('a, img, form, input').remove()

  return parseLinesFromHtml(clone.html()).filter((line) => {
    const lower = line.toLowerCase()

    if (!lower) return false
    if (lower.includes('click here to buy tickets now')) return false
    if (lower.includes('click here to book tickets now')) return false
    if (/^\[?\s*please note:/i.test(line)) return false
    if (
      /\b(q&a|introduced by|joined in conversation|will be here for q&as|will be joined|will be introduced)\b/i.test(
        line
      )
    ) {
      return false
    }

    return true
  })
}

function buildStartTimeRaw(dateText: string, timeText: string): string {
  const parsed = parseShowtime({
    dateText,
    timeText,
  })

  if (parsed) {
    return formatShowtimeRaw(parsed)
  }

  return `${normalizeWhitespace(dateText)} ${normalizeWhitespace(timeText)}`.trim()
}

function normalizeVeeziDateText(value?: string | null): string {
  const cleaned = cleanText(value)
  if (!cleaned) return ''

  const match = cleaned.match(
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2}),\s+([A-Za-z]+)$/i
  )

  if (!match?.[1] || !match?.[2] || !match?.[3]) {
    return cleaned
  }

  return `${match[1]} ${match[3]} ${match[2]}`
}

function normalizeAnchorTimeText(value?: string | null): string {
  return cleanText(value).replace(/,\s*$/, '')
}

function buildCalendarMonthUrls(sourceUrl: string): string[] {
  const baseUrl = normalizeWhitespace(sourceUrl) || DEFAULT_ANTHOLOGY_LIST_URL
  const startMonth = DateTime.now().setZone(APP_TIMEZONE).startOf('month')
  const urls = new Set<string>()

  for (let offset = 0; offset <= 2; offset += 1) {
    const target = startMonth.plus({ months: offset })
    const url = new URL(baseUrl)

    url.hash = ''
    url.searchParams.set('view', 'list')
    url.searchParams.set('month', String(target.month))
    url.searchParams.set('year', String(target.year))

    urls.add(url.toString())
  }

  return [...urls]
}

function getVeeziSourceUrl(sourceUrl: string): string {
  const cleaned = normalizeWhitespace(sourceUrl)
  if (cleaned.includes('veezi.com')) {
    return cleaned
  }

  return DEFAULT_ANTHOLOGY_VEEZI_URL
}

function getCalendarSourceUrl(sourceUrl: string): string {
  const cleaned = normalizeWhitespace(sourceUrl)
  if (cleaned.includes('anthologyfilmarchives.org')) {
    return cleaned
  }

  return DEFAULT_ANTHOLOGY_LIST_URL
}

function extractRawFormat(value?: string | null): string | undefined {
  const cleaned = cleanText(value)
  if (!cleaned) return undefined

  const patterns = [
    /\bSuper-?8mm(?:-and-16mm-to-DCP|-and-16mm|-to-(?:16mm|35mm|DCP|digital))?\b/i,
    /\b16mm(?:-to-(?:35mm|DCP|digital))?\b/i,
    /\b35mm(?:-to-(?:16mm|DCP|digital))?\b/i,
    /\b70mm(?:-to-DCP)?\b/i,
    /\b4K DCP\b/i,
    /\bDCP\b/i,
    /\bdigital\b/i,
    /\bBlu-?ray\b/i,
    /\b(?:b&w|color|silent)\b/i,
  ]

  for (const pattern of patterns) {
    const match = cleaned.match(pattern)
    if (match?.[0]) {
      return normalizeWhitespace(match[0])
    }
  }

  return undefined
}

function extractCountry(value?: string | null): string | undefined {
  const cleaned = cleanText(value)
  if (!cleaned) return undefined

  const parts = cleaned
    .split(',')
    .map((part) => cleanText(part))
    .filter(Boolean)

  for (const part of parts) {
    if (/^in\s+/i.test(part)) continue
    if (/^with\s+/i.test(part)) continue
    if (/^distributed\b/i.test(part)) continue
    if (/^restored\b/i.test(part)) continue
    if (/^preservation\b/i.test(part)) continue
    if (/^co-directed by\b/i.test(part)) continue
    if (parseYear(part)) continue
    if (parseRuntimeMinutes(part)) continue
    if (extractRawFormat(part)) continue

    if (/^[A-Z][A-Za-z.&' -]+(?:\/[A-Z][A-Za-z.&' -]+)*$/u.test(part)) {
      return part
    }
  }

  return undefined
}

function parseMetaLine(metaLine?: string): ParsedAnthologyMeta {
  const cleaned = cleanText(metaLine)
  if (!cleaned) return {}

  return {
    country: extractCountry(cleaned),
    rawFormat: extractRawFormat(cleaned),
    releaseYear: parseYear(cleaned),
    runtimeMinutes: parseRuntimeMinutes(cleaned),
  }
}

function extractDirectorFromHeaderLine(line?: string): string | undefined {
  const cleaned = cleanText(line)
  if (!cleaned) return undefined

  const byMatch = cleaned.match(/^by\s+(.+)$/i)
  if (byMatch?.[1]) {
    return cleanText(byMatch[1])
  }

  return undefined
}

function extractCoDirector(metaLine?: string): string | undefined {
  const cleaned = cleanText(metaLine)
  if (!cleaned) return undefined

  const match = cleaned.match(/Co-directed by\s+(.+?)(?:\.|$)/i)
  return match?.[1] ? cleanText(match[1]) : undefined
}

function looksLikeMetaLine(line?: string): boolean {
  const cleaned = cleanText(line)
  if (!cleaned) return false

  return Boolean(parseYear(cleaned) && (parseRuntimeMinutes(cleaned) || extractRawFormat(cleaned)))
}

function looksLikePersonName(line?: string): boolean {
  const cleaned = cleanText(line)
  if (!cleaned) return false
  if (cleaned.length > 80) return false
  if (/\d/.test(cleaned)) return false

  const parts = cleaned.split(/\s+/)
  if (parts.length < 1 || parts.length > 5) return false

  return /^[A-ZÀ-Ý][\p{L}.''\-]+(?:\s+[A-ZÀ-Ý][\p{L}.''\-]+){0,4}$/u.test(cleaned)
}

function looksLikeTitle(line?: string): boolean {
  const cleaned = cleanText(line)
  if (!cleaned) return false
  if (cleaned.length > 160) return false
  if (parseYear(cleaned) || parseRuntimeMinutes(cleaned)) return false
  if (/^in\s+/i.test(cleaned)) return false
  if (/^(click here|total running time|with |distributed by|co-presented by|presented by)/i.test(cleaned)) {
    return false
  }

  return true
}

function extractEmbeddedFeature(noteLines: string[]): EmbeddedFeature {
  const metaIndexes = noteLines.reduce<number[]>((acc, line, index) => {
    if (looksLikeMetaLine(line)) {
      acc.push(index)
    }
    return acc
  }, [])

  if (metaIndexes.length !== 1) {
    return {
      metaCount: metaIndexes.length,
      lineIndexes: [],
    }
  }

  const metaIndex = metaIndexes[0]
  const titleIndex = metaIndex - 1
  const directorIndex = metaIndex - 2
  const title = looksLikeTitle(noteLines[titleIndex]) ? noteLines[titleIndex] : undefined
  const directorText = looksLikePersonName(noteLines[directorIndex])
    ? noteLines[directorIndex]
    : undefined

  return {
    directorText,
    lineIndexes: [directorIndex, titleIndex, metaIndex].filter((index) => index >= 0),
    metaCount: 1,
    metaLine: noteLines[metaIndex],
    title,
  }
}

function mergeDirectorText(...values: Array<string | undefined>): string | undefined {
  const unique = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)

  return unique.length ? unique.join(', ') : undefined
}

function cleanAnthologyTitle(input?: string | null): string {
  let title = cleanText(input)
  if (!title) return ''

  title = title
    .replace(/^["""''']+/, '')
    .replace(/["""''']+$/, '')
    .trim()

  return title
}

function isWeakTmdbCandidate(candidate: string, primaryTitle: string): boolean {
  const normalizedCandidate = normalizeComparableText(candidate)
  if (!normalizedCandidate) return true

  if (normalizedCandidate.length < 3) return true

  const candidateParts = normalizedCandidate.split(/\s+/).filter(Boolean)
  const normalizedPrimary = normalizeComparableText(primaryTitle)
  const primaryParts = normalizedPrimary.split(/\s+/).filter(Boolean)

  if (
    candidateParts.length === 1 &&
    primaryParts.length > 1 &&
    normalizedCandidate.length < 6
  ) {
    return true
  }

  if (normalizedPrimary.includes(normalizedCandidate) && normalizedCandidate.length < 5) {
    return true
  }

  return false
}

function stripCreatorPossessiveTitle(
  title?: string | null,
  directorText?: string
): string | undefined {
  const cleanedTitle = cleanAnthologyTitle(title)
  if (!cleanedTitle || !directorText) {
    return cleanedTitle || undefined
  }

  const match =
    cleanedTitle.match(/^(.+?)'s\s+(.+)$/i) ||
    cleanedTitle.match(/^(.+?)'s\s+(.+)$/i)

  if (!match?.[1] || !match?.[2]) {
    return cleanedTitle
  }

  const owner = cleanText(match[1])
  const remainder = cleanAnthologyTitle(match[2])
  const normalizedOwner = normalizeComparableText(owner)
  const normalizedDirector = normalizeComparableText(directorText)
  const directorParts = normalizedDirector.split(/\s+/).filter(Boolean)
  const ownerParts = normalizedOwner.split(/\s+/).filter(Boolean)

  if (!normalizedOwner || !remainder || ownerParts.length > 4) {
    return cleanedTitle
  }

  if (!looksLikePersonName(owner) && !/^[A-ZÀ-Ý][\p{L}.''\-]{2,}$/u.test(owner)) {
    return cleanedTitle
  }

  const matchesDirector =
    normalizedDirector === normalizedOwner ||
    directorParts.includes(normalizedOwner) ||
    ownerParts.every((part) => directorParts.includes(part))

  return matchesDirector ? remainder : cleanedTitle
}

function stripEpisodeSuffix(title?: string | null): string | undefined {
  const cleaned = cleanAnthologyTitle(title)
  if (!cleaned) return undefined

  const stripped = cleaned.replace(
    /(?:,|:)\s*(?:NOS?\.\s*\d+(?:\s*-\s*\d+)?|NO\.\s*\d+(?:\s*-\s*\d+)?|PART\s+[A-Z0-9IVXLC]+(?:\s*-\s*[A-Z0-9IVXLC]+)?|VOLS?\.\s*[A-Z0-9IVXLC]+(?:\s*-\s*[A-Z0-9IVXLC]+)?|EPISODES?\s+\d+(?:\s*-\s*\d+)?|CHAPTER\s+[A-Z0-9IVXLC]+)\.?$/i,
    ''
  )

  return stripped && stripped !== cleaned ? cleanAnthologyTitle(stripped) : cleaned
}

function chooseMovieTitle(input: {
  directorText?: string
  embeddedFeature: EmbeddedFeature
  metaLine?: string
  rawTitle: string
}): string {
  const rawTitle = cleanAnthologyTitle(input.rawTitle)
  if (!rawTitle) return ''

  const quotedMatch = rawTitle.match(/\bPRESENTS\s+[""](.+?)[""]/i)
  if (quotedMatch?.[1]) {
    return cleanAnthologyTitle(quotedMatch[1])
  }

  if (
    input.embeddedFeature.metaCount === 1 &&
    input.embeddedFeature.title &&
    /\bPRESENTS\b/i.test(rawTitle)
  ) {
    return cleanAnthologyTitle(input.embeddedFeature.title)
  }

  if (
    input.embeddedFeature.metaCount === 1 &&
    input.embeddedFeature.title &&
    rawTitle.includes(':')
  ) {
    const embeddedTitle = cleanAnthologyTitle(input.embeddedFeature.title)
    const normalizedRaw = normalizeComparableText(rawTitle)
    const normalizedEmbedded = normalizeComparableText(embeddedTitle)

    if (
      normalizedEmbedded &&
      normalizedRaw !== normalizedEmbedded &&
      (normalizedRaw.endsWith(normalizedEmbedded) || normalizedRaw.includes(normalizedEmbedded))
    ) {
      return embeddedTitle
    }
  }

  if (/^EC:\s*/i.test(rawTitle) && (input.directorText || input.metaLine)) {
    return cleanAnthologyTitle(rawTitle.replace(/^EC:\s*/i, ''))
  }

  if (/\s+\/\s+/.test(rawTitle) && (input.directorText || input.metaLine)) {
    const primaryTitle = cleanAnthologyTitle(rawTitle.split(/\s+\/\s+/)[0])
    return stripCreatorPossessiveTitle(primaryTitle, input.directorText) || primaryTitle
  }

  return stripCreatorPossessiveTitle(rawTitle, input.directorText) || rawTitle
}

function chooseOverview(
  noteLines: string[],
  embeddedFeature: EmbeddedFeature,
  rawTitle?: string
): string | undefined {
  const usedIndexes = new Set(embeddedFeature.lineIndexes)
  const rawPrefix = rawTitle?.includes(':')
    ? cleanAnthologyTitle(rawTitle.split(':')[0])
    : undefined
  const normalizedPrefix = normalizeComparableText(rawPrefix)

  const lines = noteLines.filter((line, index) => {
    if (usedIndexes.has(index)) return false
    if (/^\([^)]+\)$/.test(line)) return false
    if (/^total running time:/i.test(line)) return false
    if (/^(?:co-)?presented by\b/i.test(line)) return false
    if (
      normalizedPrefix &&
      normalizeComparableText(line) === normalizedPrefix
    ) {
      return false
    }
    return true
  })

  const overview = normalizeWhitespace(lines.join('\n\n'))
  return overview || undefined
}

function buildShowingSourceUrl(pageUrl: string, hash?: string): string {
  const url = new URL(pageUrl)
  url.hash = hash || ''
  return url.toString()
}

function extractPurchaseId(ticketUrl?: string): string | undefined {
  const cleaned = cleanText(ticketUrl)
  if (!cleaned) return undefined

  const match = cleaned.match(/\/purchase\/(\d+)/i)
  return match?.[1]
}

function pickBetterOverview(
  primary?: string,
  secondary?: string
): string | undefined {
  const a = cleanText(primary)
  const b = cleanText(secondary)

  if (!a) return b || undefined
  if (!b) return a

  return b.length > a.length + 40 ? b : a
}

function pickNonEmpty<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined)
}

function mergeUniqueStrings(
  ...values: Array<string[] | undefined>
): string[] | undefined {
  const merged = values
    .flatMap((value) => value || [])
    .map((value) => cleanAnthologyTitle(value))
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)

  return merged.length ? merged : undefined
}

function normalizePosterUrl(url?: string): string | undefined {
  const cleaned = cleanText(url)
  if (!cleaned) return undefined
  if (cleaned.includes(VEEZI_DEFAULT_POSTER_PATH)) return undefined
  return cleaned
}

function buildTitleVariants(title: string, directorText?: string): string[] {
  const variants = new Set<string>()
  const cleaned = cleanAnthologyTitle(title)

  if (!cleaned) return []

  variants.add(cleaned)

  if (/^EC:\s*/i.test(cleaned)) {
    variants.add(cleanAnthologyTitle(cleaned.replace(/^EC:\s*/i, '')))
  }

  if (cleaned.includes(':')) {
    const prefix = cleanAnthologyTitle(cleaned.split(':')[0])
    if (prefix) {
      variants.add(prefix)
    }

    const suffix = cleanAnthologyTitle(cleaned.split(':').slice(1).join(':'))
    if (suffix) {
      variants.add(suffix)
    }
  }

  if (cleaned.includes('/')) {
    const slashParts = cleaned
      .split('/')
      .map((part) => cleanAnthologyTitle(part))
      .filter(Boolean)

    for (const part of slashParts) {
      variants.add(part)
    }
  }

  const quotedMatch = cleaned.match(/\bPRESENTS\s+[""](.+?)[""]/i)
  if (quotedMatch?.[1]) {
    variants.add(cleanAnthologyTitle(quotedMatch[1]))
  }

  const withoutCreator = stripCreatorPossessiveTitle(cleaned, directorText)
  if (withoutCreator && withoutCreator !== cleaned) {
    variants.add(withoutCreator)
  }

  const withoutEpisodeSuffix = stripEpisodeSuffix(cleaned)
  if (withoutEpisodeSuffix && withoutEpisodeSuffix !== cleaned) {
    variants.add(withoutEpisodeSuffix)
  }

  return [...variants].filter(Boolean)
}

function buildTmdbTitleCandidates(input: {
  directorText?: string
  movieTitle: string
  rawTitle: string
}): string[] | undefined {
  const candidates = mergeUniqueStrings(
    buildTitleVariants(input.movieTitle, input.directorText),
    buildTitleVariants(input.rawTitle, input.directorText)
  )

  if (!candidates?.length) {
    return undefined
  }

  const normalizedMovieTitle = normalizeComparableText(input.movieTitle)
  const filtered = candidates.filter(
    (candidate) => normalizeComparableText(candidate) !== normalizedMovieTitle
  )

  const refined = filtered.filter(
    (candidate) => !isWeakTmdbCandidate(candidate, input.movieTitle)
  )

  return refined.length ? refined : undefined
}

function pickBetterMovieTitle(
  primaryTitle: string,
  secondaryTitle?: string,
  directorText?: string
): string {
  const primary = cleanAnthologyTitle(primaryTitle)
  const secondary = cleanAnthologyTitle(secondaryTitle)

  if (!secondary) return primary
  if (!primary) return secondary

  const normalizedPrimary = normalizeComparableText(primary)
  const normalizedSecondary = normalizeComparableText(secondary)

  if (normalizedPrimary === normalizedSecondary) {
    return secondary.length > primary.length ? secondary : primary
  }

  const primaryVariants = buildTitleVariants(primary, directorText).map((variant) =>
    normalizeComparableText(variant)
  )
  const secondaryVariants = buildTitleVariants(secondary, directorText).map((variant) =>
    normalizeComparableText(variant)
  )

  if (
    primary.includes('/') &&
    primaryVariants.includes(normalizedSecondary)
  ) {
    return secondary
  }

  if (
    secondary.includes('/') &&
    !primary.includes('/') &&
    secondaryVariants.includes(normalizedPrimary)
  ) {
    return primary
  }

  if (
    secondary.length > primary.length &&
    secondaryVariants.includes(normalizedPrimary)
  ) {
    return secondary
  }

  return primary
}

function buildMatchKeys(row: ScrapedShowtime): string[] {
  const variants = buildTitleVariants(row.movieTitle, row.directorText)
  const keys = new Set<string>()

  for (const variant of variants) {
    const normalized = normalizeComparableText(variant)
    if (normalized) {
      keys.add(`${normalized}|${row.startTimeRaw}`)
    }
  }

  return [...keys]
}

function indexRows(rows: ScrapedShowtime[]): Map<string, IndexedRow[]> {
  const index = new Map<string, IndexedRow[]>()

  rows.forEach((row, rowIndex) => {
    for (const key of buildMatchKeys(row)) {
      const arr = index.get(key) || []
      arr.push({
        index: rowIndex,
        row,
      })
      index.set(key, arr)
    }
  })

  return index
}

function isCalendarSourceUrl(url?: string): boolean {
  return cleanText(url).includes('anthologyfilmarchives.org')
}

function mergeRows(
  primary: ScrapedShowtime,
  secondary?: ScrapedShowtime
): ScrapedShowtime {
  const directorText = mergeDirectorText(
    primary.directorText,
    secondary?.directorText
  )
  const posterUrl = normalizePosterUrl(
    primary.posterUrl || secondary?.posterUrl
  )
  const movieTitle = pickBetterMovieTitle(
    primary.movieTitle || '',
    secondary?.movieTitle,
    directorText
  )

  return {
    movieTitle,
    shownTitle: pickBetterMovieTitle(
      primary.shownTitle || primary.movieTitle || '',
      secondary?.shownTitle || secondary?.movieTitle,
      directorText
    ),
    startTimeRaw: primary.startTimeRaw || secondary?.startTimeRaw || '',
    ticketUrl: primary.ticketUrl || secondary?.ticketUrl,
    sourceUrl:
      (secondary?.sourceUrl && isCalendarSourceUrl(secondary.sourceUrl)
        ? secondary.sourceUrl
        : undefined) ||
      primary.sourceUrl ||
      secondary?.sourceUrl,
    rawFormat: pickNonEmpty(primary.rawFormat, secondary?.rawFormat),
    sourceShowtimeId:
      primary.sourceShowtimeId || secondary?.sourceShowtimeId,
    directorText,
    releaseYear: pickNonEmpty(primary.releaseYear, secondary?.releaseYear),
    runtimeMinutes: pickNonEmpty(primary.runtimeMinutes, secondary?.runtimeMinutes),
    overview: pickBetterOverview(primary.overview, secondary?.overview),
    posterUrl: posterUrl || DEFAULT_ANTHOLOGY_POSTER_URL,
    tmdbTitleCandidates: mergeUniqueStrings(
      primary.tmdbTitleCandidates,
      secondary?.tmdbTitleCandidates,
      buildTitleVariants(movieTitle, directorText)
    ),
    preferMovieTitleForDisplay:
      primary.preferMovieTitleForDisplay || secondary?.preferMovieTitleForDisplay,
    matchedMovieTitleHint:
      primary.matchedMovieTitleHint || secondary?.matchedMovieTitleHint,
  }
}

function finalizeFallbackPoster(row: ScrapedShowtime): ScrapedShowtime {
  return {
    ...row,
    posterUrl: normalizePosterUrl(row.posterUrl) || DEFAULT_ANTHOLOGY_POSTER_URL,
  }
}

function parseCalendarShowingRows(
  showing: cheerio.Cheerio<AnyNode>,
  dateText: string,
  pageUrl: string
): ScrapedShowtime[] {
  const details = showing.find('.showing-details').first()
  if (!details.length) return []

  const headerLines = getHeaderLines(details)
  const timeEntries = details
    .children('a[name^="showing-"]')
    .toArray()
    .map((anchor) => {
      const root = details.find(anchor)
      return {
        sourceShowtimeId: root.attr('name') || undefined,
        timeText: normalizeAnchorTimeText(root.text()),
      }
    })
    .filter((entry) => entry.sourceShowtimeId && entry.timeText)

  const timeSet = new Set(timeEntries.map((entry) => entry.timeText))
  const rawTitle =
    headerLines.find((line) => !timeSet.has(normalizeAnchorTimeText(line))) || ''

  if (!timeEntries.length || !rawTitle) {
    return []
  }

  const directorText = extractDirectorFromHeaderLine(
    headerLines.find((line) => /^by\s+/i.test(line))
  )
  const metaLine =
    headerLines.find(
      (line) =>
        !timeSet.has(normalizeAnchorTimeText(line)) &&
        line !== rawTitle &&
        line !== `by ${directorText}`
    ) || undefined

  const noteRoot = details.find('.film-notes').first()
  const noteLines = noteRoot.length ? getNoteLines(noteRoot) : []
  const embeddedFeature = extractEmbeddedFeature(noteLines)
  const meta = parseMetaLine(metaLine || embeddedFeature.metaLine)
  const coDirector = extractCoDirector(metaLine || embeddedFeature.metaLine)

  const movieTitle = chooseMovieTitle({
    directorText: mergeDirectorText(
      directorText,
      embeddedFeature.metaCount === 1 ? embeddedFeature.directorText : undefined
    ),
    embeddedFeature,
    metaLine,
    rawTitle,
  })
  const shownTitle = cleanAnthologyTitle(rawTitle)
  const normalizedMovieTitle =
    stripEpisodeSuffix(movieTitle) || movieTitle || shownTitle

  const mergedDirector = mergeDirectorText(
    directorText,
    embeddedFeature.metaCount === 1 ? embeddedFeature.directorText : undefined,
    coDirector
  )
  const tmdbTitleCandidates = buildTmdbTitleCandidates({
    directorText: mergedDirector,
    movieTitle: normalizedMovieTitle,
    rawTitle,
  })

  const shareUrl =
    details.find('.share-box .envelope input.highlight-on-click').attr('value') ||
    details.find('.share-box .envelope a').first().attr('href')

  const sourceUrlBase = absoluteAnthologyUrl(shareUrl) || pageUrl
  const ticketUrl =
    absoluteAnthologyUrl(noteRoot.find('a[href*="ticketing"]').first().attr('href')) ||
    absoluteAnthologyUrl(noteRoot.find('a[href*="veezi"]').first().attr('href'))

  return timeEntries.map((entry) => ({
    movieTitle: normalizedMovieTitle,
    shownTitle,
    startTimeRaw: buildStartTimeRaw(dateText, entry.timeText),
    ticketUrl,
    sourceUrl: buildShowingSourceUrl(sourceUrlBase, entry.sourceShowtimeId),
    rawFormat: meta.rawFormat,
    sourceShowtimeId: entry.sourceShowtimeId,
    directorText: mergedDirector,
    releaseYear: meta.releaseYear,
    runtimeMinutes: meta.runtimeMinutes,
    overview: chooseOverview(noteLines, embeddedFeature, rawTitle),
    posterUrl: absoluteAnthologyUrl(
      noteRoot.find('img.screening-image').first().attr('src')
    ),
    tmdbTitleCandidates,
    preferMovieTitleForDisplay: normalizedMovieTitle !== shownTitle,
    matchedMovieTitleHint: normalizedMovieTitle,
  }))
}

function parseCalendarMonthPage(html: string, pageUrl: string): ScrapedShowtime[] {
  const $ = cheerio.load(html)
  const rows: ScrapedShowtime[] = []

  $('h3.current-day').each((_, headingEl) => {
    const heading = $(headingEl)
    const dateText = getCurrentDayText($, heading)
    if (!dateText) return

    heading.nextUntil('h3.current-day', '.film-showing').each((__, showingEl) => {
      rows.push(...parseCalendarShowingRows($(showingEl), dateText, pageUrl))
    })
  })

  return rows
}

function parseVeeziFilmBlock(
  film: cheerio.Cheerio<AnyNode>,
  pageUrl: string
): ScrapedShowtime[] {
  const filmId = cleanText(film.attr('id'))
  const rawTitle = cleanAnthologyTitle(film.find('h3.title').first().text())
  if (!rawTitle) return []

  const desc = film.find('p.film-desc').first()
  const descLines = desc.length ? parseLinesFromHtml(desc.html()) : []
  const embeddedFeature = extractEmbeddedFeature(descLines)
  const metaLine =
    embeddedFeature.metaLine || descLines.find((line) => looksLikeMetaLine(line))
  const meta = parseMetaLine(metaLine)
  const coDirector = extractCoDirector(metaLine)
  const embeddedDirector =
    embeddedFeature.metaCount === 1 ? embeddedFeature.directorText : undefined

  const movieTitle = chooseMovieTitle({
    directorText: embeddedDirector,
    embeddedFeature,
    metaLine,
    rawTitle,
  })
  const shownTitle = cleanAnthologyTitle(rawTitle)
  const normalizedMovieTitle =
    stripEpisodeSuffix(movieTitle) || movieTitle || shownTitle

  const sourceUrl = buildShowingSourceUrl(
    pageUrl,
    filmId || normalizedMovieTitle
  )
  const directorText = mergeDirectorText(embeddedDirector, coDirector)
  const overview = chooseOverview(descLines, embeddedFeature, rawTitle)
  const tmdbTitleCandidates = buildTmdbTitleCandidates({
    directorText,
    movieTitle: normalizedMovieTitle,
    rawTitle,
  })

  const rows: ScrapedShowtime[] = []

  film.find('.sessions .date-container').each((_, dateContainerEl) => {
    const dateContainer = film.find(dateContainerEl)
    const dateText = cleanText(dateContainer.find('h4.date').first().text())
    if (!dateText) return

    dateContainer.find('ul.session-times a[href]').each((__, anchorEl) => {
      const anchor = film.find(anchorEl)
      const timeText = cleanText(anchor.find('time').first().text() || anchor.text())
      const ticketUrl = absoluteVeeziUrl(anchor.attr('href'))

      if (!timeText) return

      rows.push({
        movieTitle: normalizedMovieTitle,
        shownTitle,
        startTimeRaw: buildStartTimeRaw(normalizeVeeziDateText(dateText), timeText),
        ticketUrl,
        sourceUrl,
        rawFormat: meta.rawFormat,
        sourceShowtimeId: extractPurchaseId(ticketUrl),
        directorText,
        releaseYear: meta.releaseYear,
        runtimeMinutes: meta.runtimeMinutes,
        overview,
        tmdbTitleCandidates,
        preferMovieTitleForDisplay: normalizedMovieTitle !== shownTitle,
        matchedMovieTitleHint: normalizedMovieTitle,
      })
    })
  })

  return rows
}

function parseVeeziPage(html: string, pageUrl: string): ScrapedShowtime[] {
  const $ = cheerio.load(html)
  const rows: ScrapedShowtime[] = []

  $('#sessionsByFilmConent > .film').each((_, filmEl) => {
    rows.push(...parseVeeziFilmBlock($(filmEl), pageUrl))
  })

  return rows
}

async function scrapeCalendarShowtimes(sourceUrl: string): Promise<ScrapedShowtime[]> {
  const monthUrls = buildCalendarMonthUrls(sourceUrl)
  const allRows: ScrapedShowtime[] = []
  const seen = new Set<string>()

  for (const monthUrl of monthUrls) {
    const html = await fetchHtml(monthUrl)
    const rows = parseCalendarMonthPage(html, monthUrl)

    for (const row of rows) {
      const dedupeKey =
        row.sourceShowtimeId ||
        `${row.movieTitle}|${row.startTimeRaw}|${row.ticketUrl || ''}|${row.sourceUrl || ''}`

      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      allRows.push(row)
    }
  }

  return allRows
}

export async function scrapeAnthologyShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const veeziUrl = getVeeziSourceUrl(config.sourceUrl)
  const calendarUrl = getCalendarSourceUrl(config.sourceUrl)

  const [veeziHtml, calendarRows] = await Promise.all([
    fetchHtml(veeziUrl),
    scrapeCalendarShowtimes(calendarUrl),
  ])

  const veeziRows = parseVeeziPage(veeziHtml, veeziUrl)
  const calendarIndex = indexRows(calendarRows)
  const usedCalendarRows = new Set<number>()
  const mergedRows: ScrapedShowtime[] = []

  for (const veeziRow of veeziRows) {
    let matchedCalendarRow: ScrapedShowtime | undefined

    for (const key of buildMatchKeys(veeziRow)) {
      const candidates = calendarIndex.get(key) || []
      const match = candidates.find((candidate) => !usedCalendarRows.has(candidate.index))

      if (match) {
        matchedCalendarRow = match.row
        usedCalendarRows.add(match.index)
        break
      }
    }

    mergedRows.push(finalizeFallbackPoster(mergeRows(veeziRow, matchedCalendarRow)))
  }

  calendarRows.forEach((calendarRow, index) => {
    if (usedCalendarRows.has(index)) return
    mergedRows.push(finalizeFallbackPoster(calendarRow))
  })

  const deduped: ScrapedShowtime[] = []
  const seen = new Set<string>()

  for (const row of mergedRows) {
    const dedupeKey =
      row.sourceShowtimeId ||
      `${normalizeComparableText(row.movieTitle)}|${row.startTimeRaw}|${row.ticketUrl || ''}`

    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    deduped.push(row)
  }

  return deduped
}
