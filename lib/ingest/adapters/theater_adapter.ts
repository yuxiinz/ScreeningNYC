// lib/ingest/adapters/theater_adapter.ts

import axios from 'axios'
import * as cheerio from 'cheerio'

export type ScrapedShowtime = {
  movieTitle: string
  startTimeRaw: string
  ticketUrl?: string
  sourceUrl?: string
  rawFormat?: string
  sourceShowtimeId?: string

  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  overview?: string
  posterUrl?: string
}

export type TheaterAdapterConfig = {
  sourceUrl: string
}

type DetailMovieInfo = {
  title?: string
  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  rawFormat?: string
  overview?: string
  posterUrl?: string
}

function normalizeWhitespace(input?: string | null): string {
  return (input || '').replace(/\s+/g, ' ').trim()
}

function buildAbsoluteUrl(baseUrl: string, maybeRelative?: string): string | undefined {
  if (!maybeRelative) return undefined
  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return undefined
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  })

  return res.data
}

function parseMetaLine(metaText: string): {
  year?: number
  runtimeMinutes?: number
  format?: string
} {
  const cleaned = normalizeWhitespace(metaText)
  const parts = cleaned.split('/').map((s) => normalizeWhitespace(s))

  let year: number | undefined
  let runtimeMinutes: number | undefined
  let format: string | undefined

  for (const part of parts) {
    if (!year) {
      const yearMatch = part.match(/\b(18|19|20)\d{2}\b/)
      if (yearMatch) year = Number(yearMatch[0])
    }

    if (!runtimeMinutes) {
      const runtimeMatch = part.match(/(\d+)\s*min/i)
      if (runtimeMatch) runtimeMinutes = Number(runtimeMatch[1])
    }
  }

  if (parts.length > 0) {
    format = parts[parts.length - 1]
  }

  return { year, runtimeMinutes, format }
}

async function scrapeMetrographDetailPage(url: string): Promise<DetailMovieInfo> {
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const title =
    normalizeWhitespace($('h1').first().text()) ||
    normalizeWhitespace($('.film_title').first().text()) ||
    normalizeWhitespace($('.entry-title').first().text())

  let posterUrl =
    buildAbsoluteUrl(url, $('.film_poster img').first().attr('src')) ||
    buildAbsoluteUrl(url, $('.film_image img').first().attr('src')) ||
    buildAbsoluteUrl(url, $('.entry-content img').first().attr('src')) ||
    buildAbsoluteUrl(url, $('img').first().attr('src'))

  const text = $('body').text()

  let directorText: string | undefined
  const directorMatch = text.match(/DIRECTOR:\s*([^\n]+)/i)
  if (directorMatch) {
    directorText = normalizeWhitespace(directorMatch[1])
  }

  let metaLine: string | undefined
  const metaMatch = text.match(/\b(18|19|20)\d{2}\s*\/\s*\d+\s*MIN\s*\/\s*[^\n]+/i)
  if (metaMatch) {
    metaLine = normalizeWhitespace(metaMatch[0])
  }

  const parsedMeta = parseMetaLine(metaLine || '')

  let overview: string | undefined =
  normalizeWhitespace($('.synopsis').first().text()) ||
  normalizeWhitespace(
    $('.entry-content p')
      .map((_, el) => $(el).text())
      .get()
      .join(' ')
  )

  if (!overview) overview = undefined

  return {
    title: title || undefined,
    directorText,
    releaseYear: parsedMeta.year,
    runtimeMinutes: parsedMeta.runtimeMinutes,
    rawFormat: parsedMeta.format,
    overview,
    posterUrl,
  }
}

export async function scrapeShowtimesFromPage(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const html = await fetchHtml(config.sourceUrl)
  const $ = cheerio.load(html)

  const rows: ScrapedShowtime[] = []

  const detailCache = new Map<string, DetailMovieInfo>()

  const movieCards = $('.homepage-in-theater-movie').toArray()

  for (const movieEl of movieCards) {
    const movieCard = $(movieEl)

    const movieTitle = normalizeWhitespace(
      movieCard.find('h3.movie_title a').first().text()
    )

    const detailHref = movieCard.find('h3.movie_title a').first().attr('href')
    const detailUrl = buildAbsoluteUrl(config.sourceUrl, detailHref) || config.sourceUrl

    if (!movieTitle) continue

    let detailInfo = detailCache.get(detailUrl)
    if (!detailInfo) {
      try {
        detailInfo = await scrapeMetrographDetailPage(detailUrl)
        detailCache.set(detailUrl, detailInfo)
      } catch (error) {
        detailInfo = {}
      }
    }

    const fallbackMetaText = normalizeWhitespace(
      movieCard.find('h5').eq(1).text()
    )
    const fallbackMeta = parseMetaLine(fallbackMetaText)

    const showtimesRoot = movieCard.find('.showtimes').first()
    if (!showtimesRoot.length) continue

    let currentDateLabel = ''

    showtimesRoot.children().each((__, child) => {
      const node = $(child)
      const tagName = (node.get(0)?.tagName || '').toLowerCase()

      if (tagName === 'h5' && node.hasClass('sr-only')) {
        currentDateLabel = normalizeWhitespace(node.text())
        return
      }

      if (tagName === 'h6') {
        currentDateLabel = normalizeWhitespace(node.text())
        return
      }

      if (tagName === 'div' && node.hasClass('film_day')) {
        const links = node.find('a')

        links.each((___, linkEl) => {
          const link = $(linkEl)
          const timeText = normalizeWhitespace(link.text())
          if (!timeText) return

          const href = link.attr('href')
          const ticketUrl = buildAbsoluteUrl(config.sourceUrl, href)

          let sourceShowtimeId: string | undefined
          if (href) {
            try {
              const parsed = new URL(buildAbsoluteUrl(config.sourceUrl, href)!)
              sourceShowtimeId = parsed.searchParams.get('txtSessionId') || undefined
            } catch {
              sourceShowtimeId = undefined
            }
          }

          const startTimeRaw = `${currentDateLabel} ${timeText}`.trim()

          rows.push({
            movieTitle: detailInfo?.title || movieTitle,
            startTimeRaw,
            ticketUrl,
            sourceUrl: detailUrl,
            rawFormat: detailInfo?.rawFormat || fallbackMeta.format,
            sourceShowtimeId,
            directorText: detailInfo?.directorText,
            releaseYear: detailInfo?.releaseYear || fallbackMeta.year,
            runtimeMinutes: detailInfo?.runtimeMinutes || fallbackMeta.runtimeMinutes,
            overview: detailInfo?.overview,
            posterUrl: detailInfo?.posterUrl,
          })
        })
      }
    })
  }

  return rows
}