// lib/ingest/adapters/paris_adapter.ts

/**
 * Paris Theater (single screen, operated by Netflix)
 * The public site is a static Next.js app whose rendered HTML embeds
 * serialized film and event data (from an underlying Strapi API).
 *
 * To avoid hitting undocumented APIs (and risking rate limits or auth),
 * we scrape the home page HTML and pull out the serialized fields we need.
 *
 * The serialized data contains structures like:
 * "FilmName":"Birth","Slug":"birth-something-very-bad", ...,
 * "FilmFormat":"35MM", ... "events":{"data":[{"attributes":{
 *   "EventName":"...","EventDate":"2026-04-09","EventTime":"7 PM",
 *   "TicketLink":"https://..."
 * }}]}
 *
 * We only emit showtimes when both EventDate and EventTime are present to
 * avoid writing incorrect times. Missing/ambiguous rows are safely skipped.
 */

import * as cheerio from 'cheerio'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { cleanText, normalizeWhitespace } from '../core/text'
import { buildAbsoluteUrl } from '../core/url'

type ParsedEvent = {
  filmName: string
  slug?: string
  eventDate: string
  eventTime: string
  filmFormat?: string
  ticketUrl?: string
}

function extractEventsFromHtml(html: string): ParsedEvent[] {
  const results: ParsedEvent[] = []

  // Roughly isolate the large serialized payload to keep regex work smaller.
  // The data lives inside many <script> tags pushed via self.__next_f.
  const $ = cheerio.load(html)
  const scripts = $('script')
    .map((_, el) => $(el).html() || '')
    .get()
    .join('\n')
  const normalizedScripts = scripts.replace(/\\"/g, '"')

  // Regex is intentionally permissive to survive minor shape changes.
  const filmBlockRe =
    /"FilmName":"([^"]+?)".+?"Slug":"([^"]+?)".+?(?:\"FilmFormat\":\"([^\"]*?)\")?.+?"events":\{"data":\[([\s\S]*?)\]\}/g

  let filmMatch: RegExpExecArray | null
  while ((filmMatch = filmBlockRe.exec(normalizedScripts)) !== null) {
    const filmName = filmMatch[1]
    const slug = filmMatch[2]
    const format = filmMatch[3]
    const events = filmMatch[4]
    if (!filmName || !events) continue

    const eventRe =
      /"EventDate":"(\d{4}-\d{2}-\d{2})".+?"EventTime":"([^"]+?)"(?:.+?"TicketLink":"([^"]+?)")?/g

    let evtMatch: RegExpExecArray | null
    while ((evtMatch = eventRe.exec(events)) !== null) {
      const eventDate = evtMatch[1]
      const eventTime = evtMatch[2]
      const ticketUrl = evtMatch[3]
      if (!eventDate || !eventTime) continue

      results.push({
        filmName,
        slug,
        eventDate,
        eventTime,
        filmFormat: format || undefined,
        ticketUrl: ticketUrl ? ticketUrl.replace(/\\\//g, '/') : undefined,
      })
    }
  }

  // Independent event blocks (eventsData) carry one-off screenings
  const eventDataRe =
    /"EventName":"([^"]+?)".*?"EventDate":"(\d{4}-\d{2}-\d{2})".*?"EventTime":"([^"]+?)"(?:.*?"TicketLink":"([^"]+?)")?/g

  let eventMatch: RegExpExecArray | null
  while ((eventMatch = eventDataRe.exec(normalizedScripts)) !== null) {
    const filmName = eventMatch[1]
    const eventDate = eventMatch[2]
    const eventTime = eventMatch[3]
    const ticketUrl = eventMatch[4]
    if (!filmName || !eventDate || !eventTime) continue

    results.push({
      filmName,
      eventDate,
      eventTime,
      ticketUrl: ticketUrl ? ticketUrl.replace(/\\\//g, '/') : undefined,
    })
  }

  return results
}

function decodeEscapedUnicode(input?: string): string {
  if (!input) return ''
  return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )
}

function extractDetailUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html)
  const urls = new Set<string>()

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    // Detail pages typically live under /films/ or /movies/
    if (href.includes('/film') || href.includes('/movie')) {
      const abs = buildAbsoluteUrl(baseUrl, href)
      if (abs) urls.add(abs)
    }
  })

  return [...urls]
}

const LISTING_URLS = [
  'https://www.paristheaternyc.com/series-and-events',
  'https://www.paristheaternyc.com/special-engagements',
]

export async function scrapeParisShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const aggregatedEvents: ParsedEvent[] = []
  const detailUrls = new Set<string>()

  // Fetch listing pages
  for (const url of LISTING_URLS) {
    try {
      const html = await fetchHtml(url)
      extractEventsFromHtml(html).forEach((evt) => aggregatedEvents.push(evt))
      extractDetailUrls(html, url).forEach((u) => detailUrls.add(u))
    } catch {
      // continue; we prefer partial data to failing the whole ingest
    }
  }

  // Also include the main page (in case listings miss anything)
  try {
    const homeHtml = await fetchHtml(config.sourceUrl)
    extractEventsFromHtml(homeHtml).forEach((evt) => aggregatedEvents.push(evt))
    extractDetailUrls(homeHtml, config.sourceUrl).forEach((u) => detailUrls.add(u))
  } catch {
    // ignore
  }

  // Drill into each detail page for fuller data
  for (const url of detailUrls) {
    try {
      const html = await fetchHtml(url)
      extractEventsFromHtml(html).forEach((evt) => aggregatedEvents.push(evt))
    } catch {
      // ignore one-off failures
    }
  }

  // Deduplicate by film + date + time
  const seen = new Set<string>()
  const events = aggregatedEvents.filter((evt) => {
    const key = `${evt.filmName}__${evt.eventDate}__${evt.eventTime}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const showtimes: ScrapedShowtime[] = []

  for (const evt of events) {
    // Convert YYYY-MM-DD into a Month Day, Year string so parseStartTime can succeed.
    let dateLabel = evt.eventDate
    let timeLabel = evt.eventTime
    timeLabel = timeLabel.replace(/(\d{1,2})\s*(am|pm)/i, '$1:00 $2')
    timeLabel = timeLabel.replace(/(\d{1,2})\s*$/i, '$1:00')
    try {
      const d = new Date(evt.eventDate)
      const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'America/New_York' })
      const day = d.getDate()
      const year = d.getFullYear()
      dateLabel = `${month} ${day}, ${year}`
    } catch {
      // keep raw; parseStartTime will fail gracefully and be counted
    }

    const startTimeRaw = `${normalizeWhitespace(dateLabel)} ${normalizeWhitespace(timeLabel)}`

    showtimes.push({
      movieTitle: cleanText(decodeEscapedUnicode(evt.filmName)),
      startTimeRaw,
      ticketUrl: evt.ticketUrl,
      sourceUrl: config.sourceUrl,
      rawFormat: normalizeWhitespace(evt.filmFormat),
      sourceShowtimeId: evt.slug
        ? `${evt.slug}__${evt.eventDate}__${evt.eventTime}`
        : undefined,
      matchedMovieTitleHint: evt.filmName,
    })
  }

  return showtimes
}
