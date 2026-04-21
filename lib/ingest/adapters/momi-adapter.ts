// lib/ingest/adapters/momi-adapter.ts

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DateTime } from 'luxon'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { formatShowtimeRaw } from '../core/datetime'
import { parseFormat, parseRuntimeMinutes, parseYear } from '../core/meta'
import { decodeHtmlEntities, normalizeWhitespace } from '../core/text'
import { APP_TIMEZONE } from '../../timezone'

const execFileAsync = promisify(execFile)

const DEFAULT_MOMI_LIST_URL =
  'https://movingimage.org/events/list/?tribe_filterbar_category_custom%5B0%5D=253&tribe_filterbar_category_custom%5B1%5D=230'

const CURL_TIMEOUT_MS = 45000
const CURL_MAX_BUFFER_BYTES = 25 * 1024 * 1024
const TICKET_URL_PATTERNS = [
  /altru\d+\.sky\.blackbaud\.com/i,
  /docs\.google\.com\/forms/i,
  /forms\.gle\//i,
]

type IcsEvent = {
  uid: string
  sourceUrl: string
  movieTitle: string
  shownTitle: string
  startTimeRaw: string
  categories: string[]
  description?: string
  posterUrl?: string
}

function cleanText(value?: string | null): string {
  return normalizeWhitespace(decodeHtmlEntities(value).replace(/\u00a0/g, ' '))
}

function buildJinaUrl(targetUrl: string): string {
  const cleaned = normalizeWhitespace(targetUrl).replace(/^https?:\/\//i, '')
  return `https://r.jina.ai/http://${cleaned}`
}

function unwrapJinaContent(raw: string): string {
  const marker = 'Markdown Content:\n'
  const markerIndex = raw.indexOf(marker)

  if (markerIndex >= 0) {
    return raw.slice(markerIndex + marker.length).trim()
  }

  return raw.trim()
}

async function fetchJinaContent(targetUrl: string): Promise<string> {
  const { stdout } = await execFileAsync('curl', ['-L', buildJinaUrl(targetUrl)], {
    encoding: 'utf8',
    timeout: CURL_TIMEOUT_MS,
    maxBuffer: CURL_MAX_BUFFER_BYTES,
  })

  const text = unwrapJinaContent(typeof stdout === 'string' ? stdout : String(stdout))
  if (!text) {
    throw new Error(`[momi] Empty response from Jina proxy for ${targetUrl}`)
  }

  return text
}

function buildIcsListUrl(sourceUrl: string): string {
  const fallback = new URL(DEFAULT_MOMI_LIST_URL)
  const cleaned = normalizeWhitespace(sourceUrl)

  let url: URL
  try {
    url = new URL(cleaned || DEFAULT_MOMI_LIST_URL)
  } catch {
    url = fallback
  }

  url.protocol = 'https:'
  url.hostname = 'movingimage.org'
  url.pathname = '/events/list/'
  url.searchParams.set('ical', '1')
  url.searchParams.set('tribe_filterbar_category_custom[0]', '253')
  url.searchParams.set('tribe_filterbar_category_custom[1]', '230')

  return url.toString()
}

function unfoldIcs(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '')
}

function unescapeIcsText(value?: string): string {
  const decoded = decodeHtmlEntities(value)
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')

  return decoded.replace(/\u00a0/g, ' ')
}

function parseIcsDateTime(value?: string, tzid?: string): DateTime | null {
  const cleaned = normalizeWhitespace(value)
  if (!cleaned) return null

  const zone = tzid || APP_TIMEZONE
  const formats = [
    "yyyyMMdd'T'HHmmss",
    "yyyyMMdd'T'HHmm",
  ]

  for (const format of formats) {
    const dt = DateTime.fromFormat(cleaned, format, { zone })
    if (dt.isValid) {
      return dt
    }
  }

  if (/^\d{8}$/.test(cleaned)) {
    const dt = DateTime.fromFormat(cleaned, 'yyyyMMdd', { zone }).startOf('day')
    if (dt.isValid) {
      return dt
    }
  }

  return null
}

function parseIcsCategories(value?: string): string[] {
  return unescapeIcsText(value)
    .split(',')
    .map((part) => cleanText(part))
    .filter(Boolean)
}

function finalizeIcsEvent(current: {
  uid?: string
  url?: string
  summary?: string
  description?: string
  categories?: string[]
  attach?: string
  dtstart?: string
  dtstartTzid?: string
}): IcsEvent | null {
  const uid = cleanText(current.uid)
  const sourceUrl = cleanText(current.url)
  const movieTitle = cleanText(current.summary)
  const dt = parseIcsDateTime(current.dtstart, current.dtstartTzid)
  const categories = current.categories || []

  if (!uid || !sourceUrl || !movieTitle || !dt) {
    return null
  }

  if (!categories.some((category) => category.toLowerCase() === 'screening')) {
    return null
  }

  return {
    uid,
    sourceUrl,
    movieTitle,
    shownTitle: movieTitle,
    startTimeRaw: formatShowtimeRaw(dt.toJSDate()),
    categories,
    description: cleanText(unescapeIcsText(current.description)),
    posterUrl: cleanText(current.attach) || undefined,
  }
}

function parseIcsEvents(text: string): IcsEvent[] {
  const rows: IcsEvent[] = []
  const lines = unfoldIcs(text).split(/\r?\n/)
  let current:
    | {
        uid?: string
        url?: string
        summary?: string
        description?: string
        categories?: string[]
        attach?: string
        dtstart?: string
        dtstartTzid?: string
      }
    | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {}
      continue
    }

    if (line === 'END:VEVENT') {
      if (current) {
        const row = finalizeIcsEvent(current)
        if (row) {
          rows.push(row)
        }
      }
      current = null
      continue
    }

    if (!current) continue

    const separatorIndex = line.indexOf(':')
    if (separatorIndex <= 0) continue

    const rawKey = line.slice(0, separatorIndex)
    const value = line.slice(separatorIndex + 1)
    const baseKey = rawKey.split(';', 1)[0]

    if (baseKey === 'DTSTART') {
      current.dtstart = value
      const tzidMatch = rawKey.match(/TZID=([^;:]+)/i)
      current.dtstartTzid = tzidMatch?.[1] || APP_TIMEZONE
      continue
    }

    switch (baseKey) {
      case 'UID':
        current.uid = value
        break
      case 'URL':
        current.url = value
        break
      case 'SUMMARY':
        current.summary = value
        break
      case 'DESCRIPTION':
        current.description = value
        break
      case 'CATEGORIES':
        current.categories = parseIcsCategories(value)
        break
      case 'ATTACH':
        current.attach = value
        break
      default:
        break
    }
  }

  return rows
}

function parseDirectorText(text?: string): string | undefined {
  const cleaned = cleanText(text)
  if (!cleaned) return undefined

  const match = cleaned.match(/Dir\.\s+(.+?)\.\s+(?:18|19|20)\d{2}\b/i)
  return match?.[1] ? cleanText(match[1]) : undefined
}

function buildOverview(description?: string): string | undefined {
  const cleaned = unescapeIcsText(description)
  if (!cleaned) return undefined

  const paragraphs = cleaned
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .filter((line) => !/^Tickets:/i.test(line))
    .filter((line) => !/^Order tickets\./i.test(line))

  if (!paragraphs.length) return undefined

  return paragraphs.join('\n\n')
}

function extractTicketUrl(markdown: string): string | undefined {
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  const links = [...markdown.matchAll(linkPattern)].map((match) => ({
    label: cleanText(match[1].replace(/[*_`]/g, '')),
    url: cleanText(match[2]),
  }))

  const preferred = links.find((link) => {
    return (
      /order tickets|purchase tickets|reserve tickets|free with rsvp|rsvp/i.test(
        link.label
      ) ||
      TICKET_URL_PATTERNS.some((pattern) => pattern.test(link.url))
    )
  })

  return preferred?.url || undefined
}

function extractLocation(markdown: string): string | undefined {
  const match = markdown.match(/^###\s+Location:\s+(.+)$/m)
  return match?.[1] ? cleanText(match[1]) : undefined
}

function buildSourceShowtimeId(uid: string, ticketUrl?: string): string {
  if (ticketUrl) {
    try {
      const parsed = new URL(ticketUrl)
      for (const param of ['txobjid', 'occ_id', 'event_id', 'id']) {
        const value = parsed.searchParams.get(param)
        if (value) {
          return `momi_${param}_${value}`
        }
      }
    } catch {
      return `momi_uid_${uid}`
    }
  }

  return `momi_uid_${uid}`
}

function looksLikeProgram(event: IcsEvent): boolean {
  const title = event.movieTitle.toLowerCase()
  const description = cleanText(event.description).toLowerCase()

  return (
    title.includes('opening night') ||
    title.includes('double feature') ||
    title.includes('festival') ||
    title.includes('shorts') ||
    title.includes('program') ||
    description.includes('festival') ||
    description.includes('discussion with filmmakers') ||
    description.includes('free with rsvp')
  )
}

async function buildShowtimeFromIcsEvent(event: IcsEvent): Promise<ScrapedShowtime> {
  const detailMarkdown = await fetchJinaContent(event.sourceUrl)
  const ticketUrl = extractTicketUrl(detailMarkdown)
  const locationText = extractLocation(detailMarkdown)
  const metaSource = event.description || ''
  const treatAsProgram = looksLikeProgram(event)

  return {
    movieTitle: event.movieTitle,
    shownTitle: event.shownTitle,
    startTimeRaw: event.startTimeRaw,
    ticketUrl,
    sourceUrl: event.sourceUrl,
    rawFormat: treatAsProgram ? undefined : parseFormat(metaSource),
    sourceShowtimeId: buildSourceShowtimeId(event.uid, ticketUrl),
    directorText: treatAsProgram ? undefined : parseDirectorText(metaSource),
    releaseYear: treatAsProgram ? undefined : parseYear(metaSource),
    runtimeMinutes: treatAsProgram ? undefined : parseRuntimeMinutes(metaSource),
    overview:
      buildOverview(event.description) ||
      (locationText ? `Location: ${locationText}` : undefined),
    posterUrl: event.posterUrl,
  }
}

export async function scrapeMomiShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const listUrl = buildIcsListUrl(config.sourceUrl)
  const icsText = await fetchJinaContent(listUrl)
  const events = parseIcsEvents(icsText)

  const rows: ScrapedShowtime[] = []
  let detailSucceeded = 0
  let detailFailed = 0

  for (const event of events) {
    try {
      rows.push(await buildShowtimeFromIcsEvent(event))
      detailSucceeded += 1
    } catch (error) {
      detailFailed += 1

      console.warn(
        `[momi] detail fallback failed for ${event.sourceUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )

      const metaSource = event.description || ''
      const treatAsProgram = looksLikeProgram(event)

      rows.push({
        movieTitle: event.movieTitle,
        shownTitle: event.shownTitle,
        startTimeRaw: event.startTimeRaw,
        sourceUrl: event.sourceUrl,
        rawFormat: treatAsProgram ? undefined : parseFormat(metaSource),
        sourceShowtimeId: buildSourceShowtimeId(event.uid),
        directorText: treatAsProgram ? undefined : parseDirectorText(metaSource),
        releaseYear: treatAsProgram ? undefined : parseYear(metaSource),
        runtimeMinutes: treatAsProgram ? undefined : parseRuntimeMinutes(metaSource),
        overview: buildOverview(event.description),
        posterUrl: event.posterUrl,
      })
    }
  }

  console.log(
    `[momi] ICS events parsed: ${events.length}; detail enrichment succeeded: ${detailSucceeded}; detail enrichment failed: ${detailFailed}`
  )

  return rows
}
