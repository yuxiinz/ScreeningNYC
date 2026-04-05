// lib/ingest/adapters/cinemavillage_adapter.ts

import * as cheerio from 'cheerio'
import { DateTime } from 'luxon'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { cleanText, decodeHtmlEntities, normalizeWhitespace } from '../core/text'
import { buildAbsoluteUrl } from '../core/url'
import { parseRuntimeMinutes, parseYear } from '../core/meta'
import { buildShowtimeRaw, parseShowtime } from '../core/datetime'
import { parseScreeningTitle } from '../core/screening_title'
import { APP_TIMEZONE } from '../../timezone'

const CINEMA_VILLAGE_BASE_URL = 'https://www.cinemavillage.com'
const DEFAULT_CALENDAR_URL = 'https://www.cinemavillage.com/calendar/'

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

function absoluteUrl(value?: string | null): string | undefined {
  return buildAbsoluteUrl(CINEMA_VILLAGE_BASE_URL, value)
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
  const calendarUrl =
    cleanText(config.sourceUrl) || DEFAULT_CALENDAR_URL

  const html = await fetchHtml(calendarUrl)
  const listings = parseCalendarPage(html)
  const detailCache = new Map<string, CinemaVillageDetail | null>()
  const rows: ScrapedShowtime[] = []
  const seen = new Set<string>()

  for (const listing of listings) {
    let detail = detailCache.get(listing.detailKey)

    if (detail === undefined) {
      try {
        detail = parseDetailPage(
          await fetchHtml(listing.sourceUrl),
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
