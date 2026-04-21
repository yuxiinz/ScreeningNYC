// lib/ingest/adapters/quad-adapter.ts

import * as cheerio from 'cheerio'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { cleanText, normalizeWhitespace } from '../core/text'
import { buildAbsoluteUrl } from '../core/url'
import { parseCommaSeparatedMeta, parseYear } from '../core/meta'
import { parseShowtime, formatShowtimeRaw } from '../core/datetime'

const QUAD_BASE_URL = 'https://quadcinema.com'
const QUAD_ALL_URL = 'https://quadcinema.com/all/'

type QuadDetailInfo = {
  sourceMovieId: string
  title: string
  sourceUrl: string
  posterUrl?: string
  overview?: string
  runtimeMinutes?: number
  rawFormat?: string
  country?: string
  releaseYear?: number
  directorText?: string
}

type QuadListingShowtime = {
  filmUrl: string
  movieTitle: string
  dateText: string
  timeText: string
  ticketUrl?: string
}

function absoluteUrl(href?: string | null): string | undefined {
  return buildAbsoluteUrl(QUAD_BASE_URL, href)
}

function safeSlugFromFilmUrl(filmUrl: string): string {
  try {
    const url = new URL(filmUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] || filmUrl
  } catch {
    return filmUrl
  }
}

function buildQuadStartTimeRaw(dateText: string, timeText: string): string {
  const parsed = parseShowtime({
    dateText,
    timeText,
  })

  if (parsed) {
    return formatShowtimeRaw(parsed)
  }

  return `${normalizeWhitespace(dateText)} ${normalizeWhitespace(timeText)}`.trim()
}

function extractSourceShowtimeId(
  sourceMovieId: string,
  dateText: string,
  timeText: string,
  ticketUrl?: string
): string {
  const parsed = parseShowtime({
    dateText,
    timeText,
  })

  if (parsed) {
    return `${sourceMovieId}__${parsed.toISOString()}`
  }

  return `${sourceMovieId}__${normalizeWhitespace(dateText)}__${normalizeWhitespace(timeText)}__${ticketUrl || ''}`
}

function parseAllPageShowtimes(allHtml: string): QuadListingShowtime[] {
  const $ = cheerio.load(allHtml)
  const rows: QuadListingShowtime[] = []

  $('.now-single-day').each((_, dayEl) => {
    const dayRoot = $(dayEl)
    const dateText = cleanText(dayRoot.find('.trailing-rule-wrap h1').first().text())
    if (!dateText) return

    dayRoot.find('.now-listings .single-listing').each((__, listingEl) => {
      const listing = $(listingEl)

      const filmUrl = absoluteUrl(listing.find('h4 a').first().attr('href'))
      const movieTitle = cleanText(listing.find('h4 a').first().text())

      if (!filmUrl || !movieTitle) return
      if (!filmUrl.includes('/film/')) return

      listing.find('ul.showtimes-list li a').each((___, aEl) => {
        const a = $(aEl)
        const href = absoluteUrl(a.attr('href'))
        const rawTime = cleanText(a.text()).replace(/\*/g, '')

        if (!rawTime) return

        const parsed = parseShowtime({
          dateText,
          timeText: rawTime,
        })

        if (!parsed) {
          return
        }

        rows.push({
          filmUrl,
          movieTitle,
          dateText,
          timeText: rawTime,
          ticketUrl: href,
        })
      })
    })
  })

  return rows
}

function extractQuadTitle(
  $: cheerio.CheerioAPI,
  fallback: string
): string {
  return (
    cleanText($('.film-title').first().text()) ||
    cleanText($('h1').first().text()) ||
    fallback
  )
}

function extractQuadPosterUrl($: cheerio.CheerioAPI): string | undefined {
  return (
    absoluteUrl($('.img-wrap img').first().attr('src')) ||
    absoluteUrl($('meta[property="og:image"]').attr('content')) ||
    absoluteUrl($('img').first().attr('src'))
  )
}

function extractQuadSynopsis($: cheerio.CheerioAPI): string | undefined {
  const synopsis = cleanText(
    $('.copy-wrap p')
      .map((_, el) => $(el).text())
      .get()
      .join('\n\n')
  )

  return synopsis || undefined
}

function extractQuadMetaLine($: cheerio.CheerioAPI): string {
  return (
    cleanText($('.section p').first().text()) ||
    cleanText($('.film-title').first().next('p').text()) ||
    ''
  )
}

function extractQuadDirectorText($: cheerio.CheerioAPI): string | undefined {
  const directors = $('.credit-item')
    .map((_, el) => {
      const label = cleanText($(el).find('.credit-label').text()).toLowerCase()

      if (label.includes('film by') || label.includes('director')) {
        return $(el)
          .find('.credit-name')
          .map((__, nameEl) => cleanText($(nameEl).text()))
          .get()
      }

      return []
    })
    .get()
    .flat()
    .filter(Boolean)

  if (!directors.length) return undefined
  return directors.join(', ')
}

function parseDetailPage(
  detailHtml: string,
  filmUrl: string,
  fallbackTitle: string
): QuadDetailInfo {
  const $ = cheerio.load(detailHtml)

  const sourceMovieId = safeSlugFromFilmUrl(filmUrl)
  const title = extractQuadTitle($, fallbackTitle || sourceMovieId)
  const posterUrl = extractQuadPosterUrl($)
  const overview = extractQuadSynopsis($)
  const metaLine = extractQuadMetaLine($)
  const parsedMeta = parseCommaSeparatedMeta(metaLine)
  const directorText = extractQuadDirectorText($)

  const releaseYear =
    parseYear(metaLine) ||
    parsedMeta.year ||
    undefined

  return {
    sourceMovieId,
    title,
    sourceUrl: filmUrl,
    posterUrl,
    overview,
    runtimeMinutes: parsedMeta.runtimeMinutes || undefined,
    rawFormat: parsedMeta.format || undefined,
    country: parsedMeta.country || undefined,
    releaseYear,
    directorText,
  }
}

export async function scrapeQuadCinemaShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const listingUrl =
    config.sourceUrl && config.sourceUrl.trim()
      ? config.sourceUrl
      : QUAD_ALL_URL

  const allHtml = await fetchHtml(listingUrl)
  const listingRows = parseAllPageShowtimes(allHtml)

  const detailCache = new Map<string, QuadDetailInfo>()
  const rows: ScrapedShowtime[] = []

  for (const item of listingRows) {
    let detail = detailCache.get(item.filmUrl)

    if (!detail) {
      try {
        const detailHtml = await fetchHtml(item.filmUrl)
        detail = parseDetailPage(detailHtml, item.filmUrl, item.movieTitle)
        detailCache.set(item.filmUrl, detail)
      } catch {
        detail = {
          sourceMovieId: safeSlugFromFilmUrl(item.filmUrl),
          title: item.movieTitle,
          sourceUrl: item.filmUrl,
        }
      }
    }

    const sourceMovieId = detail.sourceMovieId
    const startTimeRaw = buildQuadStartTimeRaw(item.dateText, item.timeText)
    const sourceShowtimeId = extractSourceShowtimeId(
      sourceMovieId,
      item.dateText,
      item.timeText,
      item.ticketUrl
    )

    rows.push({
      movieTitle: detail.title || item.movieTitle,
      startTimeRaw,
      ticketUrl: item.ticketUrl,
      sourceUrl: item.filmUrl,
      rawFormat: detail.rawFormat,
      sourceShowtimeId,
      directorText: detail.directorText,
      releaseYear: detail.releaseYear,
      runtimeMinutes: detail.runtimeMinutes,
      overview: detail.overview,
      posterUrl: detail.posterUrl,
    })
  }

  return rows
}
