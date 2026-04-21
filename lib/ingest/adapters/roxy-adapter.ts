// lib/ingest/adapters/roxy-adapter.ts

import * as cheerio from 'cheerio'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { cleanText, decodeHtmlEntities } from '../core/text'
import { buildAbsoluteUrl } from '../core/url'
import { parseRuntimeMinutes, parseYear } from '../core/meta'
import { parseScreeningTitle } from '../core/screening-title'

const ROXY_BASE_URL = 'https://www.roxycinemanewyork.com'
const DEFAULT_NOW_SHOWING_URL = 'https://www.roxycinemanewyork.com/now-showing/'
const ROXY_EVENT_SUFFIX_PATTERN =
  /\s+\+\s*(?:q(?:\s*&\s*|\s+and\s+)a|q&a|qa|intro(?:duction)?|seminar|discussion|panel|conversation|in person)\b[^|]*(?=(?:\s+\|\s+|$))/gi
const ROXY_PRESENTS_PREFIX_PATTERN = /^(.+?)\s+presents:?\s+(.+)$/i
const ROXY_SERIES_SUFFIX_PATTERN = /\s+\|\s+.+$/
const ROXY_FORMAT_SUFFIX_PATTERN =
  /\s*[-–—]\s*(4K\s*DCP|DCP|35\s*MM|16\s*MM|70\s*MM|IMAX|DIGITAL|BLU[\s-]?RAY|SUPER[\s-]?8(?:MM)?)\b.*$/i
const ROXY_TRAILING_SEPARATOR_PATTERN = /\s*[-–—:|]+\s*$/

function absoluteUrl(value?: string | null): string | undefined {
  return buildAbsoluteUrl(ROXY_BASE_URL, value)
}

function extractPurchaseId(ticketUrl?: string): string | undefined {
  const cleaned = cleanText(ticketUrl)
  if (!cleaned) return undefined

  return cleaned.match(/\/purchase\/(\d+)\b/i)?.[1]
}

function stripRoxyEventSuffixes(value?: string | null): string {
  return cleanText(value).replace(ROXY_EVENT_SUFFIX_PATTERN, '').trim()
}

function stripRoxyCuratorialPrefix(value?: string | null): string {
  const cleaned = cleanText(value)
  const match = cleaned.match(ROXY_PRESENTS_PREFIX_PATTERN)
  if (!match?.[1] || !match[2]) return cleaned

  const prefix = cleanText(match[1])
  const rest = cleanText(match[2])
  if (!prefix || !rest || prefix.split(/\s+/).length > 6) return cleaned

  return rest
}

function normalizeRoxyShownTitle(rawTitle: string): string {
  return stripRoxyCuratorialPrefix(stripRoxyEventSuffixes(rawTitle))
    .replace(ROXY_SERIES_SUFFIX_PATTERN, '')
    .replace(ROXY_FORMAT_SUFFIX_PATTERN, '')
    .replace(ROXY_TRAILING_SEPARATOR_PATTERN, '')
    .trim()
}

export async function scrapeRoxyShowtimes(
  config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const sourceUrl = cleanText(config.sourceUrl) || DEFAULT_NOW_SHOWING_URL
  const html = await fetchHtml(sourceUrl)
  const $ = cheerio.load(html)
  const rows: ScrapedShowtime[] = []

  $('.detailed-screening__card').each((_, cardEl) => {
    const card = $(cardEl)
    const rawTitle = cleanText(
      decodeHtmlEntities(card.find('.detailed-screening__title').first().text())
    )
    const shownTitle = normalizeRoxyShownTitle(rawTitle)
    const rawTitleParse = parseScreeningTitle(rawTitle)
    const displayTitleParse = parseScreeningTitle(shownTitle)
    const movieTitle =
      displayTitleParse.title || shownTitle || rawTitleParse.title || rawTitle
    const infoLine = cleanText(
      decodeHtmlEntities(card.find('.detailed-screening__info').first().text())
    )
    const ticketUrl = card
      .find('.detailed-screening__cta[href*="/purchase/"]')
      .first()
      .attr('href')

    if (!shownTitle) return

    rows.push({
      movieTitle,
      shownTitle,
      startTimeRaw:
        cleanText(card.attr('data-datetime')) ||
        cleanText(card.find('.detailed-screening__time').first().text()),
      ticketUrl,
      sourceUrl:
        absoluteUrl(
          card.find('.detailed-screening__cta.cta--text-link').first().attr('href')
        ) || sourceUrl,
      rawFormat: rawTitleParse.rawFormat || displayTitleParse.rawFormat,
      sourceShowtimeId: extractPurchaseId(ticketUrl),
      releaseYear: rawTitleParse.releaseYear || displayTitleParse.releaseYear || parseYear(infoLine),
      runtimeMinutes: parseRuntimeMinutes(infoLine),
      overview:
        cleanText(
          decodeHtmlEntities(card.find('.detailed-screening__copy').first().text())
        ) || undefined,
      posterUrl: absoluteUrl(card.find('.detailed-screening__image').attr('src')),
      tmdbTitleCandidates:
        displayTitleParse.tmdbTitleCandidates || rawTitleParse.tmdbTitleCandidates,
      preferMovieTitleForDisplay:
        displayTitleParse.preferMovieTitleForDisplay ||
        rawTitleParse.preferMovieTitleForDisplay ||
        undefined,
      matchedMovieTitleHint: movieTitle !== shownTitle ? movieTitle : undefined,
    })
  })

  return rows
}
