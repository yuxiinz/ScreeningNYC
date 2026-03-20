// lib/ingest/adapters/ifc_adapter.ts

import * as cheerio from 'cheerio'
import { DateTime } from 'luxon'
import type { ScrapedShowtime, TheaterAdapterConfig } from './types'
import { fetchHtml } from './shared'

const IFC_BASE = 'https://www.ifccenter.com'
const IFC_HOME = 'https://www.ifccenter.com/'
const IFC_COMING_SOON = 'https://www.ifccenter.com/coming-soon/#all-films'
const TIMEZONE = 'America/New_York'

type RawMovie = {
  title: string
  canonicalTitle: string
  detailUrl: string
  posterUrl?: string | null
  synopsis?: string | null
  country?: string | null
  year?: number | null
  runningTimeMinutes?: number | null
  format?: string | null
  distributor?: string | null
  director?: string | null
  cast?: string[] | null
  accessibility?: string[] | null
  isComingSoon?: boolean
  openDate?: string | null
  metadata?: Record<string, string | string[] | number | null>
}

type RawShowtime = {
  movieTitle: string
  canonicalTitle: string
  detailUrl: string
  ticketUrl?: string | null
  startTime: Date
  dateLabel: string
  timeLabel: string
  isOpenCaptioning?: boolean
}

type IfcIngestResult = {
  movies: RawMovie[]
  showtimes: RawShowtime[]
}

function absoluteUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url, IFC_BASE).toString()
  } catch {
    return undefined
  }
}

function cleanText(text?: string | null): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#038;/g, '&')
}

function normalizeTitle(title: string): string {
  let t = cleanText(decodeHtmlEntities(title))
  t = t.replace(/\s*\(Open Captioning\)\s*$/i, '')
  t = t.replace(/\s*\(OC\)\s*$/i, '')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

function isOpenCaptioningTitle(title: string): boolean {
  return /\bopen captioning\b/i.test(title)
}

function parseRunningTimeMinutes(value?: string | null): number | null {
  if (!value) return null
  const m = value.match(/(\d+)\s*minutes?/i)
  return m ? Number(m[1]) : null
}

function parseYear(value?: string | null): number | null {
  if (!value) return null
  const m = value.match(/\b(19|20)\d{2}\b/)
  return m ? Number(m[0]) : null
}

function parseCast(value?: string | null): string[] | null {
  if (!value) return null
  const arr = value
    .split(',')
    .map((x) => cleanText(x))
    .filter(Boolean)
  return arr.length ? arr : null
}

function parseAccessibility(value?: string | null): string[] | null {
  if (!value) return null
  const arr = value
    .split(',')
    .map((x) => cleanText(x))
    .filter(Boolean)
  return arr.length ? arr : null
}

function parseIfcDateTime(dateLabel: string, timeLabel: string): Date | null {
  const cleanDate = cleanText(dateLabel)
  const cleanTime = cleanText(timeLabel).toLowerCase()

  const nowNy = DateTime.now().setZone(TIMEZONE)
  let dt = DateTime.fromFormat(
    `${cleanDate} ${cleanTime} ${nowNy.year}`,
    'ccc LLL d h:mm a yyyy',
    { zone: TIMEZONE }
  )

  if (!dt.isValid) {
    dt = DateTime.fromFormat(
      `${cleanDate} ${cleanTime} ${nowNy.year}`,
      'ccc LLL dd h:mm a yyyy',
      { zone: TIMEZONE }
    )
  }

  if (!dt.isValid) return null

  if (dt < nowNy.minus({ months: 9 })) {
    dt = dt.plus({ years: 1 })
  }

  return dt.toUTC().toJSDate()
}

function extractSourceShowtimeId(ticketUrl?: string | null): string | undefined {
  if (!ticketUrl) return undefined
  const m = ticketUrl.match(/evtinfo=([^~&]+)/i)
  return m?.[1]
}

function extractHomeFilmLinks(html: string): Map<string, {
  title: string
  posterUrl?: string | null
}> {
  const $ = cheerio.load(html)
  const map = new Map<string, { title: string; posterUrl?: string | null }>()

  $('.showtimes .daily-schedule ul > li').each((_, el) => {
    const title = cleanText($(el).find('.details h3 a').first().text())
    const detailUrl = absoluteUrl($(el).find('.details h3 a').first().attr('href'))
    const posterUrl = absoluteUrl($(el).find('img').first().attr('src'))

    if (!title || !detailUrl) return
    if (!detailUrl.includes('/films/')) return

    if (!map.has(detailUrl)) {
      map.set(detailUrl, { title, posterUrl: posterUrl || null })
    }
  })

  return map
}

function extractComingSoonFilmLinks(html: string): Map<string, {
  title: string
  posterUrl?: string | null
  openDate?: string | null
}> {
  const $ = cheerio.load(html)
  const map = new Map<string, {
    title: string
    posterUrl?: string | null
    openDate?: string | null
  }>()

  $('#all-films .ifc-grid-item').each((_, el) => {
    const title = cleanText($(el).find('.ifc-grid-info h2').first().text())
    const detailUrl = absoluteUrl($(el).find('a').first().attr('href'))
    const posterUrl = absoluteUrl($(el).find('img').first().attr('src'))
    const openDate = cleanText($(el).find('.ifc-grid-info p').first().text())

    if (!title || !detailUrl) return
    if (!detailUrl.includes('/films/')) return

    if (!map.has(detailUrl)) {
      map.set(detailUrl, { title, posterUrl: posterUrl || null, openDate })
    }
  })

  return map
}

function parseFilmDetailsList($: cheerio.CheerioAPI): Record<string, string> {
  const details: Record<string, string> = {}

  $('ul.film-details li').each((_, li) => {
    const strong = $(li).find('strong').first()
    const key = cleanText(strong.text()).replace(/:$/, '')
    const whole = cleanText($(li).text())
    const value = cleanText(whole.replace(strong.text(), ''))

    if (key && value) {
      details[key] = decodeHtmlEntities(value)
    }
  })

  return details
}

function parseSynopsis($: cheerio.CheerioAPI): string | undefined {
  const candidates: string[] = []

  $('p').each((_, p) => {
    const txt = cleanText($(p).text())
    if (txt.length >= 80) {
      candidates.push(decodeHtmlEntities(txt))
    }
  })

  if (!candidates.length) return undefined
  candidates.sort((a, b) => b.length - a.length)
  return candidates[0]
}

function parseScheduleFromDetailPage(
  $: cheerio.CheerioAPI,
  pageTitle: string,
  detailUrl: string
): RawShowtime[] {
  const canonicalTitle = normalizeTitle(pageTitle)
  const showtimes: RawShowtime[] = []

  $('ul.schedule-list > li').each((_, dayEl) => {
    const dateLabel = cleanText($(dayEl).find('.details > p strong').first().text())

    $(dayEl)
      .find('.details ul.times > li')
      .each((__, timeEl) => {
        const timeLabel = cleanText($(timeEl).find('span').first().text())
        const ticketUrl = absoluteUrl($(timeEl).find('a.ifc-button').attr('href'))
        const startTime = parseIfcDateTime(dateLabel, timeLabel)

        if (!dateLabel || !timeLabel || !startTime) return

        showtimes.push({
          movieTitle: pageTitle,
          canonicalTitle,
          detailUrl,
          ticketUrl: ticketUrl || null,
          startTime,
          dateLabel,
          timeLabel,
          isOpenCaptioning: isOpenCaptioningTitle(pageTitle),
        })
      })
  })

  return showtimes
}

async function parseFilmDetailPage(
  detailUrl: string,
  fallback: {
    title: string
    posterUrl?: string | null
    isComingSoon?: boolean
    openDate?: string | null
  }
): Promise<{ movie: RawMovie; showtimes: RawShowtime[] }> {
  const html = await fetchHtml(detailUrl)
  const $ = cheerio.load(html)

  const h1 =
    cleanText($('h1').first().text()) ||
    cleanText($("meta[property='og:title']").attr('content')) ||
    fallback.title

  const title = decodeHtmlEntities(h1)
  const canonicalTitle = normalizeTitle(title)

  const ogImage = absoluteUrl($("meta[property='og:image']").attr('content'))
  const pageImage =
    absoluteUrl($('.film-image img').first().attr('src')) ||
    absoluteUrl($('img').first().attr('src')) ||
    undefined

  const posterUrl = ogImage || pageImage || fallback.posterUrl || undefined
  const details = parseFilmDetailsList($)
  const synopsis = parseSynopsis($)
  const showtimes = parseScheduleFromDetailPage($, title, detailUrl)

  const movie: RawMovie = {
    title,
    canonicalTitle,
    detailUrl,
    posterUrl,
    synopsis,
    country: details['Country'] || null,
    year: parseYear(details['Year']),
    runningTimeMinutes: parseRunningTimeMinutes(details['Running Time']),
    format: details['Format'] || null,
    distributor: details['Distributor'] || null,
    director: details['Director'] || null,
    cast: parseCast(details['Cast']),
    accessibility: parseAccessibility(details['Accessibility']),
    isComingSoon: fallback.isComingSoon ?? false,
    openDate: fallback.openDate ?? null,
    metadata: {
      country: details['Country'] || null,
      year: parseYear(details['Year']),
      runningTime: details['Running Time'] || null,
      format: details['Format'] || null,
      distributor: details['Distributor'] || null,
      director: details['Director'] || null,
      cast: parseCast(details['Cast']),
      accessibility: parseAccessibility(details['Accessibility']),
    },
  }

  return { movie, showtimes }
}

async function scrapeIfcRaw(): Promise<IfcIngestResult> {
  const [homeHtml, comingSoonHtml] = await Promise.all([
    fetchHtml(IFC_HOME),
    fetchHtml(IFC_COMING_SOON),
  ])

  const homeFilms = extractHomeFilmLinks(homeHtml)
  const comingSoonFilms = extractComingSoonFilmLinks(comingSoonHtml)

  const detailMap = new Map<
    string,
    {
      title: string
      posterUrl?: string | null
      isComingSoon?: boolean
      openDate?: string | null
    }
  >()

  for (const [url, item] of homeFilms.entries()) {
    detailMap.set(url, {
      title: item.title,
      posterUrl: item.posterUrl,
      isComingSoon: false,
      openDate: null,
    })
  }

  for (const [url, item] of comingSoonFilms.entries()) {
    const prev = detailMap.get(url)
    detailMap.set(url, {
      title: item.title || prev?.title || '',
      posterUrl: item.posterUrl || prev?.posterUrl || null,
      isComingSoon: prev?.isComingSoon ?? true,
      openDate: item.openDate || prev?.openDate || null,
    })
  }

  const entries = [...detailMap.entries()]

  const settled = await Promise.allSettled(
    entries.map(async ([detailUrl, meta]) => parseFilmDetailPage(detailUrl, meta))
  )

  const moviesByUrl = new Map<string, RawMovie>()
  const showtimes: RawShowtime[] = []

  for (const result of settled) {
    if (result.status !== 'fulfilled') {
      console.error('IFC detail parse failed:', result.reason)
      continue
    }

    const { movie, showtimes: pageShowtimes } = result.value
    moviesByUrl.set(movie.detailUrl, movie)
    showtimes.push(...pageShowtimes)
  }

  return {
    movies: [...moviesByUrl.values()],
    showtimes,
  }
}

export async function scrapeIfcCenter(
  _config: TheaterAdapterConfig
): Promise<ScrapedShowtime[]> {
  const { movies, showtimes } = await scrapeIfcRaw()

  const movieByDetailUrl = new Map(movies.map((m) => [m.detailUrl, m]))

  return showtimes.map((s) => {
    const movie = movieByDetailUrl.get(s.detailUrl)

    return {
      movieTitle: s.canonicalTitle || s.movieTitle,
      startTimeRaw: s.startTime.toISOString(),
      ticketUrl: s.ticketUrl || undefined,
      sourceUrl: s.detailUrl,
      rawFormat: movie?.format || undefined,
      sourceShowtimeId: extractSourceShowtimeId(s.ticketUrl),
      directorText: movie?.director || undefined,
      releaseYear: movie?.year || undefined,
      runtimeMinutes: movie?.runningTimeMinutes || undefined,
      overview: movie?.synopsis || undefined,
      posterUrl: movie?.posterUrl || undefined,
    }
  })
}

if (require.main === module) {
  scrapeIfcCenter({
    theaterSlug: 'ifc',
    sourceUrl: IFC_HOME,
  })
    .then((data) => {
      console.log('showtimes:', data.length)
      console.log(JSON.stringify(data.slice(0, 3), null, 2))
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}