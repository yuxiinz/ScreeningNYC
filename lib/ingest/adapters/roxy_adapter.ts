// lib/ingest/adapters/roxy_adapter.ts

import * as cheerio from 'cheerio'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from '../core/http'
import { cleanText, decodeHtmlEntities } from '../core/text'
import { buildAbsoluteUrl } from '../core/url'
import { parseRuntimeMinutes, parseYear } from '../core/meta'
import { parseScreeningTitle } from '../core/screening_title'

const ROXY_BASE_URL = 'https://www.roxycinemanewyork.com'
const DEFAULT_NOW_SHOWING_URL = 'https://www.roxycinemanewyork.com/now-showing/'

function absoluteUrl(value?: string | null): string | undefined {
  return buildAbsoluteUrl(ROXY_BASE_URL, value)
}

function extractPurchaseId(ticketUrl?: string): string | undefined {
  const cleaned = cleanText(ticketUrl)
  if (!cleaned) return undefined

  return cleaned.match(/\/purchase\/(\d+)\b/i)?.[1]
}

function normalizeRoxyMovieTitle(shownTitle: string): string {
  return cleanText(shownTitle)
    .split(/\s+\|\s+/)[0]
    .replace(/\s+\+\s*(?:q(?:\s*&\s*|\s+and\s+)a|q&a|qa)\b.*$/i, '')
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
    const shownTitle = cleanText(
      decodeHtmlEntities(card.find('.detailed-screening__title').first().text())
    )
    const titleParse = parseScreeningTitle(normalizeRoxyMovieTitle(shownTitle))
    const displayTitleParse = parseScreeningTitle(shownTitle)
    const movieTitle = titleParse.title || displayTitleParse.title || shownTitle
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
      rawFormat: displayTitleParse.rawFormat || titleParse.rawFormat,
      sourceShowtimeId: extractPurchaseId(ticketUrl),
      releaseYear: displayTitleParse.releaseYear || titleParse.releaseYear || parseYear(infoLine),
      runtimeMinutes: parseRuntimeMinutes(infoLine),
      overview:
        cleanText(
          decodeHtmlEntities(card.find('.detailed-screening__copy').first().text())
        ) || undefined,
      posterUrl: absoluteUrl(card.find('.detailed-screening__image').attr('src')),
      tmdbTitleCandidates: titleParse.tmdbTitleCandidates || displayTitleParse.tmdbTitleCandidates,
      preferMovieTitleForDisplay:
        titleParse.preferMovieTitleForDisplay ||
        displayTitleParse.preferMovieTitleForDisplay ||
        undefined,
      matchedMovieTitleHint: movieTitle !== shownTitle ? movieTitle : undefined,
    })
  })

  return rows
}
