// lib/ingest/adapters/metrograph_adapter.ts

import * as cheerio from 'cheerio'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { normalizeWhitespace } from '../core/text'
import { buildAbsoluteUrl, pickFirstAbsoluteUrl } from '../core/url'
import { parseMetaLine } from '../core/meta'
import { parseShowtime, formatShowtimeRaw } from '../core/datetime'

type DetailMovieInfo = {
  title?: string
  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  rawFormat?: string
  overview?: string
  posterUrl?: string
}

function isBadMetrographPoster(url?: string): boolean {
  const s = normalizeWhitespace(url).toLowerCase()
  if (!s) return true

  return (
    s.includes('cropped-logo_metrograph') ||
    s.includes('/logo_metrograph') ||
    s.includes('metrographred.png')
  )
}

function getBestPosterUrl(
  $: cheerio.CheerioAPI,
  pageUrl: string
): string | undefined {
  const preferred = pickFirstAbsoluteUrl(pageUrl, [
    $('img.main-image').first().attr('src'),
    $('img.main-image').first().attr('data-src'),
    $('img.main-image').first().attr('data-lazy-src'),
    $('img.main-image')
      .first()
      .attr('srcset')
      ?.split(',')[0]
      ?.trim()
      .split(' ')[0],
    $('.main-image').first().attr('src'),
    $('.main-image').first().attr('data-src'),
    $('.main-image').first().attr('data-lazy-src'),
    $('meta[property="og:image"]').attr('content'),
  ])

  if (preferred && !isBadMetrographPoster(preferred)) {
    return preferred
  }

  const secondary = pickFirstAbsoluteUrl(pageUrl, [
    $('.film_poster img').first().attr('src'),
    $('.film_poster img').first().attr('data-src'),
    $('.film_poster img').first().attr('data-lazy-src'),
    $('.film_poster img')
      .first()
      .attr('srcset')
      ?.split(',')[0]
      ?.trim()
      .split(' ')[0],
    $('.film_image img').first().attr('src'),
    $('.film_image img').first().attr('data-src'),
    $('.film_image img').first().attr('data-lazy-src'),
    $('img').first().attr('src'),
    $('img').first().attr('data-src'),
  ])

  if (secondary && !isBadMetrographPoster(secondary)) {
    return secondary
  }

  return undefined
}

function cleanMetrographDirectorText(text?: string): string | undefined {
  if (!text) return undefined

  let s = normalizeWhitespace(text)
  if (!s) return undefined

  s = s
    .replace(/^Director:\s*/i, '')
    .replace(/^Directors:\s*/i, '')
    .replace(/^Directed by\s*/i, '')
    .trim()

  s = s
    .replace(/\b(18|19|20)\d{2}\s*\/\s*\d+\s*min\b.*$/i, '')
    .replace(/\b(18|19|20)\d{2}\b.*$/i, '')
    .replace(/\b\d+\s*min\b.*$/i, '')
    .replace(/\b(4K DCP|DCP|35MM|70MM|DIGITAL|IMAX)\b.*$/i, '')
    .replace(/\bPart of\b.*$/i, '')
    .replace(/\bSave \$\d+\b.*$/i, '')
    .replace(/\bBecome a Metrograph Member\b.*$/i, '')
    .replace(/\bAlready a member\?\b.*$/i, '')
    .replace(/\bRECOMMENDED\b.*$/i, '')
    .replace(/\bSeries\b.*$/i, '')
    .replace(/\bIn Theater\b.*$/i, '')
    .replace(/\bDistributor:\b.*$/i, '')
    .replace(/\bQ&A\b.*$/i, '')
    .trim()

  s = s.replace(/\s{2,}/g, ' ').trim()

  if (!s) return undefined
  if (s.length > 120) return undefined

  return s
}

function extractDirectorFromNodeText(text: string): string | undefined {
  const cleaned = normalizeWhitespace(text)
  if (!cleaned) return undefined

  const explicitMatch =
    cleaned.match(
      /Director:\s*(.+?)(?=(?:\b(18|19|20)\d{2}\b|\b\d+\s*min\b|\b(4K DCP|DCP|35MM|70MM|DIGITAL|IMAX)\b|$))/i
    ) ||
    cleaned.match(
      /Directors:\s*(.+?)(?=(?:\b(18|19|20)\d{2}\b|\b\d+\s*min\b|\b(4K DCP|DCP|35MM|70MM|DIGITAL|IMAX)\b|$))/i
    ) ||
    cleaned.match(
      /Directed by\s+(.+?)(?=(?:\b(18|19|20)\d{2}\b|\b\d+\s*min\b|\b(4K DCP|DCP|35MM|70MM|DIGITAL|IMAX)\b|$))/i
    )

  if (explicitMatch?.[1]) {
    return cleanMetrographDirectorText(explicitMatch[1])
  }

  return undefined
}

function extractDirectorBeforeMeta(text: string): string | undefined {
  const cleaned = normalizeWhitespace(text)
  if (!cleaned) return undefined

  const metaIndex = cleaned.search(/\b(18|19|20)\d{2}\s*\/\s*\d+\s*min\b/i)
  if (metaIndex <= 0) return undefined

  const beforeMeta = cleaned.slice(0, metaIndex).trim()
  if (!beforeMeta) return undefined

  return cleanMetrographDirectorText(beforeMeta)
}

function extractMetrographDirector($: cheerio.CheerioAPI): string | undefined {
  const selectors = [
    '.film_info h5',
    '.film_info p',
    '.film_info div',
    '.single-film-content h5',
    '.single-film-content p',
    '.single-film-content div',
    '.entry-content h5',
    '.entry-content p',
    '.entry-content div',
    'h5',
    'p',
    'div',
  ]

  const seen = new Set<string>()

  for (const selector of selectors) {
    const nodes = $(selector).toArray()

    for (const el of nodes) {
      const text = normalizeWhitespace($(el).text())
      if (!text || seen.has(text)) continue
      seen.add(text)

      const explicit = extractDirectorFromNodeText(text)
      if (explicit) return explicit
    }
  }

  for (const selector of selectors) {
    const nodes = $(selector).toArray()

    for (const el of nodes) {
      const text = normalizeWhitespace($(el).text())
      if (!text) continue

      const guessed = extractDirectorBeforeMeta(text)
      if (guessed) return guessed
    }
  }

  return undefined
}

function extractMetrographMetaLine($: cheerio.CheerioAPI): string | undefined {
  const selectors = [
    '.film_info h5',
    '.film_info p',
    '.film_info div',
    '.single-film-content h5',
    '.single-film-content p',
    '.single-film-content div',
    '.entry-content h5',
    '.entry-content p',
    '.entry-content div',
    'h5',
    'p',
    'div',
  ]

  const seen = new Set<string>()

  for (const selector of selectors) {
    const nodes = $(selector).toArray()

    for (const el of nodes) {
      const text = normalizeWhitespace($(el).text())
      if (!text || seen.has(text)) continue
      seen.add(text)

      if (/\b(18|19|20)\d{2}\s*\/\s*\d+\s*min\b/i.test(text)) {
        const match = text.match(
          /\b(18|19|20)\d{2}\s*\/\s*\d+\s*min(?:\s*\/\s*(?:4K DCP|DCP|35MM|70MM|DIGITAL|IMAX))?/i
        )

        if (match?.[0]) {
          return normalizeWhitespace(match[0])
        }

        return text
      }
    }
  }

  return undefined
}

async function scrapeMetrographDetailPage(url: string): Promise<DetailMovieInfo> {
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const title =
    normalizeWhitespace($('h1').first().text()) ||
    normalizeWhitespace($('.film_title').first().text())

  const directorText = extractMetrographDirector($)
  const metaLine = extractMetrographMetaLine($)
  const parsedMeta = parseMetaLine(metaLine || '')
  const posterUrl = getBestPosterUrl($, url)

  return {
    title: title || undefined,
    directorText: directorText || undefined,
    releaseYear: parsedMeta.year,
    runtimeMinutes: parsedMeta.runtimeMinutes,
    rawFormat: parsedMeta.format,
    overview: undefined,
    posterUrl,
  }
}

function extractSourceShowtimeId(
  sourceUrl: string,
  href?: string | null
): string | undefined {
  if (!href) return undefined

  try {
    const absoluteHref = buildAbsoluteUrl(sourceUrl, href)
    if (!absoluteHref) return undefined

    const parsed = new URL(absoluteHref)
    return parsed.searchParams.get('txtSessionId') || undefined
  } catch {
    return undefined
  }
}

function buildMetrographStartTimeRaw(
  dateLabel: string,
  timeText: string
): string {
  const parsed = parseShowtime({
    dateText: dateLabel,
    timeText,
  })

  if (parsed) {
    return formatShowtimeRaw(parsed)
  }

  return `${normalizeWhitespace(dateLabel)} ${normalizeWhitespace(timeText)}`.trim()
}

export async function scrapeMetrographShowtimes(
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
    const detailUrl =
      buildAbsoluteUrl(config.sourceUrl, detailHref) || config.sourceUrl

    if (!movieTitle) continue

    let detailInfo = detailCache.get(detailUrl)

    if (!detailInfo) {
      try {
        detailInfo = await scrapeMetrographDetailPage(detailUrl)
        detailCache.set(detailUrl, detailInfo)
      } catch {
        detailInfo = {}
      }
    }

    const fallbackMetaText = normalizeWhitespace(movieCard.find('h5').eq(1).text())
    const fallbackMeta = parseMetaLine(fallbackMetaText)

    const fallbackPoster = pickFirstAbsoluteUrl(config.sourceUrl, [
      movieCard.find('img.main-image').first().attr('src'),
      movieCard.find('img.main-image').first().attr('data-src'),
      movieCard.find('img').first().attr('src'),
      movieCard.find('img').first().attr('data-src'),
    ])

    const showtimesRoot = movieCard.find('.showtimes').first()
    if (!showtimesRoot.length) continue

    let currentDateLabel = ''

    showtimesRoot.children().each((_, child) => {
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

        links.each((__, linkEl) => {
          const link = $(linkEl)
          const timeText = normalizeWhitespace(link.text())
          if (!timeText) return

          const href = link.attr('href')
          const ticketUrl = buildAbsoluteUrl(config.sourceUrl, href)
          const sourceShowtimeId = extractSourceShowtimeId(
            config.sourceUrl,
            href
          )

          const startTimeRaw = buildMetrographStartTimeRaw(
            currentDateLabel,
            timeText
          )

          rows.push({
            movieTitle: detailInfo?.title || movieTitle,
            startTimeRaw,
            ticketUrl,
            sourceUrl: detailUrl,
            rawFormat: detailInfo?.rawFormat || fallbackMeta.format,
            sourceShowtimeId,
            directorText: detailInfo?.directorText,
            releaseYear: detailInfo?.releaseYear || fallbackMeta.year,
            runtimeMinutes:
              detailInfo?.runtimeMinutes || fallbackMeta.runtimeMinutes,
            overview: detailInfo?.overview,
            posterUrl: detailInfo?.posterUrl || fallbackPoster,
          })
        })
      }
    })
  }

  return rows
}