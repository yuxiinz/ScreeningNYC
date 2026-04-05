// lib/ingest/adapters/cinemavillage_adapter.ts

import axios from 'axios'
import * as cheerio from 'cheerio'
import { DateTime } from 'luxon'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { cleanText, decodeHtmlEntities, normalizeWhitespace } from '../core/text'
import { buildAbsoluteUrl } from '../core/url'
import { parseRuntimeMinutes, parseYear } from '../core/meta'
import { buildShowtimeRaw, parseShowtime } from '../core/datetime'
import { parseScreeningTitle } from '../core/screening_title'
import { APP_TIMEZONE } from '../../timezone'

const CINEMA_VILLAGE_BASE_URL = 'https://www.cinemavillage.com'
const DEFAULT_CALENDAR_URL = 'https://www.cinemavillage.com/calendar/'
const CINEMA_VILLAGE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
}

type TitleParse = ReturnType<typeof parseScreeningTitle>

type CinemaVillageListing = {
  shownTitle: string
  titleParse: TitleParse
  dateText: string
  timeText: string
  sourceUrl: string
  detailKey: string
  sourceMovieId: string
}

type CinemaVillageDetail = {
  movieTitle: string
  sourceUrl: string
  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  overview?: string
  posterUrl?: string
  ticketUrl?: string
  rawFormat?: string
  tmdbTitleCandidates?: string[]
  preferMovieTitleForDisplay?: boolean
}

type CinemaVillageSession = {
  cookie?: string
}

function absoluteUrl(value?: string | null): string | undefined {
  return buildAbsoluteUrl(CINEMA_VILLAGE_BASE_URL, value)
}

function buildCookieHeader(setCookieHeader: unknown): string | undefined {
  if (!Array.isArray(setCookieHeader)) return undefined

  const cookie = setCookieHeader
    .map((value) => cleanText(String(value).split(';')[0]))
    .filter(Boolean)
    .join('; ')

  return cookie || undefined
}

async function initCinemaVillageSession(): Promise<CinemaVillageSession> {
  try {
    const response = await axios.get<string>(`${CINEMA_VILLAGE_BASE_URL}/`, {
      timeout: 20000,
      headers: CINEMA_VILLAGE_HEADERS,
      responseType: 'text',
    })

    return {
      cookie: buildCookieHeader(response.headers['set-cookie']),
    }
  } catch {
    return {}
  }
}

async function fetchCinemaVillageHtml(
  url: string,
  session: CinemaVillageSession,
  referer = `${CINEMA_VILLAGE_BASE_URL}/`
): Promise<string> {
  const headers = {
    ...CINEMA_VILLAGE_HEADERS,
    Referer: referer,
    ...(session.cookie ? { Cookie: session.cookie } : {}),
  }

  try {
    const response = await axios.get<string>(url, {
      timeout: 20000,
      headers,
      responseType: 'text',
    })

    const nextCookie = buildCookieHeader(response.headers['set-cookie'])
    if (nextCookie) {
      session.cookie = nextCookie
    }

    return response.data
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 403) {
      throw error
    }

    const refreshedSession = await initCinemaVillageSession()
    if (refreshedSession.cookie) {
      session.cookie = refreshedSession.cookie
    }

    const retryResponse = await axios.get<string>(url, {
      timeout: 20000,
      headers: {
        ...CINEMA_VILLAGE_HEADERS,
        Referer: referer,
        ...(session.cookie ? { Cookie: session.cookie } : {}),
      },
      responseType: 'text',
    })

    const nextCookie = buildCookieHeader(retryResponse.headers['set-cookie'])
    if (nextCookie) {
      session.cookie = nextCookie
    }

    return retryResponse.data
  }
}

function stripAccessibilitySuffix(value?: string | null): string {
  return cleanText(value).replace(
    /\s+OPEN CAPTION(?:\s*\(ON-SCREEN SUBTITLES\))?$/i,
    ''
  )
}

function buildDetailKey(detailUrl: string): string {
  try {
    const url = new URL(detailUrl)
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return detailUrl
  }
}

function extractSourceMovieId(detailUrl: string): string {
  try {
    const url = new URL(detailUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    const leaf = parts[parts.length - 1] || detailUrl
    return cleanText(leaf.replace(/\.html$/i, '')) || detailUrl
  } catch {
    return cleanText(detailUrl) || detailUrl
  }
}

function buildSourceShowtimeId(
  sourceMovieId: string,
  dateText: string,
  timeText: string
): string {
  const parsed = parseShowtime({
    dateText,
    timeText,
  })

  if (parsed) {
    return `${sourceMovieId}__${parsed.toISOString()}`
  }

  return `${sourceMovieId}__${normalizeWhitespace(dateText)}__${normalizeWhitespace(timeText)}`
}

function uniqueText(values: Array<string | undefined>): string[] | undefined {
  const unique = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)

  return unique.length ? unique : undefined
}

function parseCalendarPage(html: string): CinemaVillageListing[] {
  const $ = cheerio.load(html)
  const rows: CinemaVillageListing[] = []

  $('.calendar[data-toggle="calendar"]').each((_, calendarEl) => {
    const calendar = $(calendarEl)
    const monthLabel = cleanText(calendar.find('h2.title').first().text())
    const month = DateTime.fromFormat(monthLabel, 'LLLL yyyy', {
      zone: APP_TIMEZONE,
    })

    if (!month.isValid) return

    calendar.find('.calendar-day.has-movies').each((__, dayEl) => {
      const day = calendar.find(dayEl)
      const dayNumber = Number(cleanText(day.find('.calendar-date').first().text()))

      if (!Number.isFinite(dayNumber)) return

      const date = month.set({ day: dayNumber })
      if (!date.isValid) return

      const dateText = date.toFormat('cccc, LLLL d, yyyy')

      day.find('ul > li').each((___, itemEl) => {
        const item = day.find(itemEl)
        const anchor = item.find('.title a').first()
        const detailUrl = absoluteUrl(anchor.attr('href'))
        const shownTitle = cleanText(
          decodeHtmlEntities(anchor.attr('title') || anchor.text())
        )

        if (!detailUrl || !shownTitle) return

        const normalizedTitle = stripAccessibilitySuffix(shownTitle)
        const titleParse = parseScreeningTitle(normalizedTitle)
        const detailKey = buildDetailKey(detailUrl)
        const sourceMovieId = extractSourceMovieId(detailKey)

        item.find('.shows span').each((____, timeEl) => {
          const timeText = cleanText(item.find(timeEl).text())
          if (!timeText) return

          rows.push({
            shownTitle,
            titleParse,
            dateText,
            timeText,
            sourceUrl: detailUrl,
            detailKey,
            sourceMovieId,
          })
        })
      })
    })
  })

  return rows
}

function parseDetailPage(
  html: string,
  detailUrl: string,
  fallbackShownTitle: string
): CinemaVillageDetail {
  const $ = cheerio.load(html)
  const sourceUrl = buildDetailKey(detailUrl)

  const rawTitle = cleanText(
    decodeHtmlEntities($('h1.ttl').first().text() || fallbackShownTitle)
  )
  const normalizedTitle = stripAccessibilitySuffix(rawTitle)
  const titleParse = parseScreeningTitle(normalizedTitle)
  const movieTitle = titleParse.title || normalizedTitle || fallbackShownTitle
  const movieInfo = cleanText($('.movie-info').first().text())

  let directorText: string | undefined

  $('.attrs li').each((_, liEl) => {
    const item = $(liEl)
    const label = cleanText(item.find('span').first().text())
      .replace(/:\s*$/, '')
      .toLowerCase()
    const value = cleanText(item.clone().find('span').remove().end().text())

    if (!label || !value) return

    if (label.includes('director') && !directorText) {
      directorText = value
    }
  })

  return {
    movieTitle,
    sourceUrl,
    directorText,
    releaseYear: titleParse.releaseYear || parseYear(movieInfo),
    runtimeMinutes: parseRuntimeMinutes(movieInfo),
    overview: cleanText($('.sum .sum-txt').first().text()) || undefined,
    posterUrl:
      absoluteUrl($("meta[property='og:image']").attr('content')) ||
      absoluteUrl($('img.rev-slidebg').first().attr('src')) ||
      absoluteUrl($('.movie-poster img').first().attr('src')) ||
      absoluteUrl($('img').first().attr('src')),
    ticketUrl: absoluteUrl($('.movie-action a[href]').first().attr('href')),
    rawFormat: titleParse.rawFormat,
    tmdbTitleCandidates: titleParse.tmdbTitleCandidates,
    preferMovieTitleForDisplay: titleParse.preferMovieTitleForDisplay || undefined,
  }
}

export async function scrapeCinemaVillageShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const calendarUrl = cleanText(config.sourceUrl) || DEFAULT_CALENDAR_URL
  const session = await initCinemaVillageSession()

  const html = await fetchCinemaVillageHtml(calendarUrl, session)
  const listings = parseCalendarPage(html)
  const detailCache = new Map<string, CinemaVillageDetail | null>()
  const rows: ScrapedShowtime[] = []
  const seen = new Set<string>()

  for (const listing of listings) {
    let detail = detailCache.get(listing.detailKey)

    if (detail === undefined) {
      try {
        detail = parseDetailPage(
          await fetchCinemaVillageHtml(listing.sourceUrl, session, calendarUrl),
          listing.sourceUrl,
          listing.shownTitle
        )
      } catch (error) {
        console.error('[cinemavillage] detail fetch failed:', listing.sourceUrl, error)
        detail = null
      }

      detailCache.set(listing.detailKey, detail)
    }

    const sourceShowtimeId = buildSourceShowtimeId(
      listing.sourceMovieId,
      listing.dateText,
      listing.timeText
    )

    if (seen.has(sourceShowtimeId)) {
      continue
    }

    seen.add(sourceShowtimeId)

    const movieTitle =
      detail?.movieTitle ||
      listing.titleParse.title ||
      stripAccessibilitySuffix(listing.shownTitle) ||
      listing.shownTitle

    rows.push({
      movieTitle,
      shownTitle: listing.shownTitle,
      startTimeRaw: buildShowtimeRaw(listing.dateText, listing.timeText),
      ticketUrl: detail?.ticketUrl,
      sourceUrl: listing.sourceUrl,
      rawFormat: listing.titleParse.rawFormat || detail?.rawFormat,
      sourceShowtimeId,
      directorText: detail?.directorText,
      releaseYear: listing.titleParse.releaseYear || detail?.releaseYear,
      runtimeMinutes: detail?.runtimeMinutes,
      overview: detail?.overview,
      posterUrl: detail?.posterUrl,
      tmdbTitleCandidates: uniqueText([
        ...(listing.titleParse.tmdbTitleCandidates || []),
        ...(detail?.tmdbTitleCandidates || []),
      ]),
      preferMovieTitleForDisplay:
        detail?.preferMovieTitleForDisplay ||
        listing.titleParse.preferMovieTitleForDisplay ||
        undefined,
      matchedMovieTitleHint: movieTitle !== listing.shownTitle ? movieTitle : undefined,
    })
  }

  return rows
}
