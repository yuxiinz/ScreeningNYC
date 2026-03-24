import crypto from 'crypto'
import { DateTime } from 'luxon'
import { prisma } from '../../prisma'
import { APP_TIMEZONE } from '../../timezone'
import type { TmdbMovie } from './tmdb_service'
import { canonicalizeTitle } from './tmdb_service'

type PersistConfig = {
  theaterName: string
  theaterSlug: string
  sourceName: string
  officialSiteUrl?: string
  address?: string
  latitude?: number
  longitude?: number
}

export type FallbackMovieData = {
  title: string
  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  overview?: string
  posterUrl?: string
  officialSiteUrl?: string
  genresText?: string
}

function normalizeWhitespace(input?: string | null): string {
  return (input || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim()
}

function normalizeName(input?: string | null): string {
  return normalizeWhitespace(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function releaseYearToDate(year?: number): Date | undefined {
  if (!year || Number.isNaN(year)) return undefined
  return new Date(`${year}-01-01T00:00:00.000Z`)
}

function isBadPosterUrl(url?: string | null): boolean {
  const s = normalizeWhitespace(url).toLowerCase()
  if (!s) return true

  return (
    s.includes('cropped-logo_metrograph') ||
    s.includes('/logo_metrograph') ||
    s.includes('metrographred.png')
  )
}

function choosePosterUrl(params: {
  tmdbPosterUrl?: string | null
  existingPosterUrl?: string | null
  fallbackPosterUrl?: string | null
}): string | undefined {
  if (params.tmdbPosterUrl) return params.tmdbPosterUrl

  const existingGood =
    params.existingPosterUrl && !isBadPosterUrl(params.existingPosterUrl)
      ? params.existingPosterUrl
      : undefined

  const fallbackGood =
    params.fallbackPosterUrl && !isBadPosterUrl(params.fallbackPosterUrl)
      ? params.fallbackPosterUrl
      : undefined

  return fallbackGood || existingGood || undefined
}

export function normalizeFormat(raw?: string | null): string {
  const s = normalizeWhitespace(raw).toLowerCase()

  if (!s) return 'Standard'
  if (s.includes('70mm')) return '70mm'
  if (s.includes('35mm')) return '35mm'
  if (s.includes('imax')) return 'IMAX'
  if (s.includes('3d')) return '3D'
  if (s.includes('dolby')) return 'Dolby'
  if (s.includes('digital')) return 'Digital'
  if (s.includes('4k dcp')) return '4K DCP'
  if (s.includes('dcp')) return 'DCP'

  return 'Standard'
}

export function parseStartTime(raw: string): Date | null {
  const cleaned = normalizeWhitespace(raw)
  if (!cleaned) return null

  const now = DateTime.now().setZone(APP_TIMEZONE)
  const hasExplicitYear = /\b(18|19|20)\d{2}\b/.test(cleaned)

  const withoutWeekday = cleaned
    .replace(
      /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+/i,
      ''
    )
    .trim()

  const hasAmPm = /\b(am|pm)\b/i.test(cleaned)
  const hasClockTime = /\d{1,2}:\d{2}/.test(cleaned)

  const candidates = new Set<string>()

  candidates.add(cleaned)
  candidates.add(withoutWeekday)

  if (!hasExplicitYear) {
    candidates.add(`${cleaned} ${now.year}`)
    candidates.add(`${withoutWeekday} ${now.year}`)

    const monthDayTimeMatch = withoutWeekday.match(
      /^([A-Za-z]+\.?\s+\d{1,2})(?:,\s*)?\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)$/i
    )

    if (monthDayTimeMatch) {
      candidates.add(`${monthDayTimeMatch[1]} ${now.year} ${monthDayTimeMatch[2]}`)
      candidates.add(`${monthDayTimeMatch[1]} ${monthDayTimeMatch[2]} ${now.year}`)
    }

    const numericDateTimeMatch = withoutWeekday.match(
      /^(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)$/i
    )

    if (numericDateTimeMatch) {
      candidates.add(`${numericDateTimeMatch[1]}/${now.year} ${numericDateTimeMatch[2]}`)
      candidates.add(`${numericDateTimeMatch[1]} ${now.year} ${numericDateTimeMatch[2]}`)
    }

    const dateOnlyMatch = withoutWeekday.match(/^([A-Za-z]+\.?\s+\d{1,2})$/i)
    if (dateOnlyMatch) {
      candidates.add(`${dateOnlyMatch[1]} ${now.year}`)
    }
  }

  const formats = [
    'EEEE MMMM d yyyy h:mma',
    'EEEE MMM d yyyy h:mma',
    'EEE MMMM d yyyy h:mma',
    'EEE MMM d yyyy h:mma',

    'EEEE MMMM d yyyy h:mm a',
    'EEEE MMM d yyyy h:mm a',
    'EEE MMMM d yyyy h:mm a',
    'EEE MMM d yyyy h:mm a',

    'EEEE MMMM d h:mma yyyy',
    'EEEE MMM d h:mma yyyy',
    'EEE MMMM d h:mma yyyy',
    'EEE MMM d h:mma yyyy',

    'EEEE MMMM d h:mm a yyyy',
    'EEEE MMM d h:mm a yyyy',
    'EEE MMMM d h:mm a yyyy',
    'EEE MMM d h:mm a yyyy',

    'MMMM d yyyy h:mma',
    'MMMM d yyyy h:mm a',
    'MMMM d yyyy h:mm',
    'MMMM d yyyy H:mm',

    'MMM d yyyy h:mma',
    'MMM d yyyy h:mm a',
    'MMM d yyyy h:mm',
    'MMM d yyyy H:mm',

    'LLLL d yyyy h:mma',
    'LLLL d yyyy h:mm a',
    'LLLL d yyyy h:mm',
    'LLLL d yyyy H:mm',

    'LLL d yyyy h:mma',
    'LLL d yyyy h:mm a',
    'LLL d yyyy h:mm',
    'LLL d yyyy H:mm',

    'MMMM d h:mma yyyy',
    'MMMM d h:mm a yyyy',
    'MMM d h:mma yyyy',
    'MMM d h:mm a yyyy',
    'LLLL d h:mma yyyy',
    'LLLL d h:mm a yyyy',
    'LLL d h:mma yyyy',
    'LLL d h:mm a yyyy',

    'yyyy-MM-dd h:mma',
    'yyyy-MM-dd h:mm a',
    'yyyy-MM-dd h:mm',
    'yyyy-MM-dd H:mm',

    'M/d/yyyy h:mma',
    'M/d/yyyy h:mm a',
    'M/d/yyyy h:mm',
    'M/d/yyyy H:mm',

    'M/d/yy h:mma',
    'M/d/yy h:mm a',
    'M/d/yy h:mm',
    'M/d/yy H:mm',

    'MMMM d yyyy',
    'MMM d yyyy',
    'LLLL d yyyy',
    'LLL d yyyy',
    'yyyy-MM-dd',
    'M/d/yyyy',
    'M/d/yy',
  ]

  for (const candidate of candidates) {
    for (const fmt of formats) {
      const dt = DateTime.fromFormat(candidate, fmt, { zone: APP_TIMEZONE })

      if (dt.isValid) {
        let finalDt = dt

        if (!hasClockTime && finalDt.hour === 0 && finalDt.minute === 0) {
          finalDt = finalDt.set({ hour: 12, minute: 0 })
        }

        if (!hasAmPm && /\d{1,2}:\d{2}/.test(candidate) && finalDt.hour >= 1 && finalDt.hour <= 10) {
          finalDt = finalDt.plus({ hours: 12 })
        }

        if (!hasExplicitYear && finalDt < now.minus({ months: 2 })) {
          finalDt = finalDt.plus({ years: 1 })
        }

        return finalDt.toUTC().toJSDate()
      }
    }
  }

  const iso = DateTime.fromISO(cleaned, { zone: APP_TIMEZONE })
  if (iso.isValid) return iso.toUTC().toJSDate()

  const native = new Date(cleaned)
  if (!isNaN(native.getTime())) {
    let dt = DateTime.fromJSDate(native).setZone(APP_TIMEZONE, { keepLocalTime: true })

    if (!hasAmPm && dt.hour >= 1 && dt.hour <= 10) {
      dt = dt.plus({ hours: 12 })
    }

    if (!hasExplicitYear && dt < now.minus({ months: 2 })) {
      dt = dt.plus({ years: 1 })
    }

    return dt.toUTC().toJSDate()
  }

  return null
}

export function buildFingerprint(params: {
  theaterSlug: string
  movieTitle: string
  startTimeUtcIso: string
  formatName: string
}): string {
  const raw = [
    params.theaterSlug.toLowerCase(),
    canonicalizeTitle(params.movieTitle).toLowerCase(),
    params.startTimeUtcIso,
    params.formatName.toLowerCase(),
  ].join('|')

  return crypto.createHash('sha256').update(raw).digest('hex')
}

export async function upsertTheater(config: PersistConfig) {
  return prisma.theater.upsert({
    where: { slug: config.theaterSlug },
    update: {
      name: config.theaterName,
      sourceName: config.sourceName,
      officialSiteUrl: config.officialSiteUrl || null,
      ...(config.address !== undefined ? { address: config.address } : {}),
      ...(config.latitude !== undefined ? { latitude: config.latitude } : {}),
      ...(config.longitude !== undefined ? { longitude: config.longitude } : {}),
    },
    create: {
      name: config.theaterName,
      slug: config.theaterSlug,
      sourceName: config.sourceName,
      officialSiteUrl: config.officialSiteUrl || null,
      address: config.address || null,
      latitude: typeof config.latitude === 'number' ? config.latitude : null,
      longitude: typeof config.longitude === 'number' ? config.longitude : null,
    },
  })
}

export async function upsertFormat(name: string) {
  return prisma.format.upsert({
    where: { name },
    update: {},
    create: { name },
  })
}

async function findLocalMovieBySignature(input: {
  title: string
  directorText?: string
  releaseYear?: number
}) {
  const canonicalTitle = canonicalizeTitle(input.title)
  const normalizedDirector = normalizeName(input.directorText)
  const yearDate = releaseYearToDate(input.releaseYear)

  const candidates = await prisma.movie.findMany({
    where: { title: canonicalTitle },
    orderBy: { id: 'asc' },
  })

  for (const candidate of candidates) {
    const candidateDirector = normalizeName(candidate.directorText)
    const candidateYear = candidate.releaseDate
      ? new Date(candidate.releaseDate).getUTCFullYear()
      : undefined
    const inputYear = yearDate ? yearDate.getUTCFullYear() : undefined

    const directorMatch =
      !normalizedDirector || !candidateDirector || normalizedDirector === candidateDirector

    const yearMatch =
      !inputYear || !candidateYear || inputYear === candidateYear

    if (directorMatch && yearMatch) return candidate
  }

  return null
}

export async function upsertLocalMovie(fallback: FallbackMovieData) {
  const canonicalTitle = canonicalizeTitle(fallback.title)

  const existing = await findLocalMovieBySignature({
    title: canonicalTitle,
    directorText: fallback.directorText,
    releaseYear: fallback.releaseYear,
  })

  const releaseDate = releaseYearToDate(fallback.releaseYear)

  if (existing) {
    return prisma.movie.update({
      where: { id: existing.id },
      data: {
        title: canonicalTitle,
        directorText: existing.directorText || fallback.directorText,
        releaseDate: existing.releaseDate || releaseDate,
        runtimeMinutes: existing.runtimeMinutes || fallback.runtimeMinutes,
        overview: existing.overview || fallback.overview,
        posterUrl: choosePosterUrl({
          existingPosterUrl: existing.posterUrl,
          fallbackPosterUrl: fallback.posterUrl,
        }),
        officialSiteUrl: existing.officialSiteUrl || fallback.officialSiteUrl,
        genresText: existing.genresText || fallback.genresText,
      },
    })
  }

  return prisma.movie.create({
    data: {
      title: canonicalTitle,
      directorText: fallback.directorText,
      releaseDate,
      runtimeMinutes: fallback.runtimeMinutes,
      overview: fallback.overview,
      posterUrl: choosePosterUrl({
        fallbackPosterUrl: fallback.posterUrl,
      }),
      officialSiteUrl: fallback.officialSiteUrl,
      genresText: fallback.genresText,
    },
  })
}

export async function upsertMovie(tmdb: TmdbMovie, fallback?: FallbackMovieData) {
  const fallbackTitle = canonicalizeTitle(fallback?.title || tmdb.title || 'Untitled')
  const fallbackReleaseDate = releaseYearToDate(fallback?.releaseYear)

  if (tmdb.tmdbId) {
    return prisma.movie.upsert({
      where: { tmdbId: tmdb.tmdbId },
      update: {
        title: tmdb.title || fallbackTitle,
        originalTitle: tmdb.originalTitle,
        releaseDate: tmdb.releaseDate || fallbackReleaseDate,
        runtimeMinutes: tmdb.runtimeMinutes || fallback?.runtimeMinutes,
        overview: tmdb.overview || fallback?.overview,
        posterUrl: choosePosterUrl({
          tmdbPosterUrl: tmdb.posterUrl,
          fallbackPosterUrl: fallback?.posterUrl,
        }),
        backdropUrl: tmdb.backdropUrl,
        imdbUrl: tmdb.imdbUrl,
        officialSiteUrl: tmdb.officialSiteUrl || fallback?.officialSiteUrl,
        genresText: tmdb.genresText || fallback?.genresText,
        directorText: tmdb.directorText || fallback?.directorText,
        castText: tmdb.castText,
      },
      create: {
        tmdbId: tmdb.tmdbId,
        title: tmdb.title || fallbackTitle,
        originalTitle: tmdb.originalTitle,
        releaseDate: tmdb.releaseDate || fallbackReleaseDate,
        runtimeMinutes: tmdb.runtimeMinutes || fallback?.runtimeMinutes,
        overview: tmdb.overview || fallback?.overview,
        posterUrl: choosePosterUrl({
          tmdbPosterUrl: tmdb.posterUrl,
          fallbackPosterUrl: fallback?.posterUrl,
        }),
        backdropUrl: tmdb.backdropUrl,
        imdbUrl: tmdb.imdbUrl,
        officialSiteUrl: tmdb.officialSiteUrl || fallback?.officialSiteUrl,
        genresText: tmdb.genresText || fallback?.genresText,
        directorText: tmdb.directorText || fallback?.directorText,
        castText: tmdb.castText,
      },
    })
  }

  const existing = await findLocalMovieBySignature({
    title: fallbackTitle,
    directorText: fallback?.directorText || tmdb.directorText,
    releaseYear:
      fallback?.releaseYear ||
      (tmdb.releaseDate ? new Date(tmdb.releaseDate).getUTCFullYear() : undefined),
  })

  if (existing) {
    return prisma.movie.update({
      where: { id: existing.id },
      data: {
        title: existing.title || fallbackTitle,
        originalTitle: existing.originalTitle || tmdb.originalTitle,
        releaseDate: existing.releaseDate || tmdb.releaseDate || fallbackReleaseDate,
        runtimeMinutes: existing.runtimeMinutes || tmdb.runtimeMinutes || fallback?.runtimeMinutes,
        overview: existing.overview || tmdb.overview || fallback?.overview,
        posterUrl: choosePosterUrl({
          tmdbPosterUrl: tmdb.posterUrl,
          existingPosterUrl: existing.posterUrl,
          fallbackPosterUrl: fallback?.posterUrl,
        }),
        backdropUrl: existing.backdropUrl || tmdb.backdropUrl,
        imdbUrl: existing.imdbUrl || tmdb.imdbUrl,
        officialSiteUrl:
          existing.officialSiteUrl || tmdb.officialSiteUrl || fallback?.officialSiteUrl,
        genresText: existing.genresText || tmdb.genresText || fallback?.genresText,
        directorText: existing.directorText || tmdb.directorText || fallback?.directorText,
        castText: existing.castText || tmdb.castText,
      },
    })
  }

  return prisma.movie.create({
    data: {
      title: fallbackTitle,
      originalTitle: tmdb.originalTitle,
      releaseDate: tmdb.releaseDate || fallbackReleaseDate,
      runtimeMinutes: tmdb.runtimeMinutes || fallback?.runtimeMinutes,
      overview: tmdb.overview || fallback?.overview,
      posterUrl: choosePosterUrl({
        tmdbPosterUrl: tmdb.posterUrl,
        fallbackPosterUrl: fallback?.posterUrl,
      }),
      backdropUrl: tmdb.backdropUrl,
      imdbUrl: tmdb.imdbUrl,
      officialSiteUrl: tmdb.officialSiteUrl || fallback?.officialSiteUrl,
      genresText: tmdb.genresText || fallback?.genresText,
      directorText: tmdb.directorText || fallback?.directorText,
      castText: tmdb.castText,
    },
  })
}

export async function upsertShowtime(params: {
  movieId: number
  theaterId: number
  formatId?: number
  startTime: Date
  runtimeMinutes?: number
  ticketUrl?: string
  sourceUrl?: string
  sourceShowtimeId?: string
  fingerprint: string
  sourceName: string
}) {
  return prisma.showtime.upsert({
    where: { fingerprint: params.fingerprint },
    update: {
      runtimeMinutes: params.runtimeMinutes,
      ticketUrl: params.ticketUrl,
      sourceUrl: params.sourceUrl,
      sourceName: params.sourceName,
      sourceShowtimeId: params.sourceShowtimeId,
      formatId: params.formatId,
      startTime: params.startTime,
      status: 'SCHEDULED',
      lastVerifiedAt: new Date(),
    },
    create: {
      movieId: params.movieId,
      theaterId: params.theaterId,
      formatId: params.formatId,
      startTime: params.startTime,
      runtimeMinutes: params.runtimeMinutes,
      ticketUrl: params.ticketUrl,
      sourceUrl: params.sourceUrl,
      sourceName: params.sourceName,
      sourceShowtimeId: params.sourceShowtimeId,
      fingerprint: params.fingerprint,
      status: 'SCHEDULED',
      lastVerifiedAt: new Date(),
    },
  })
}

export async function markMissingShowtimesAsCanceled(
  theaterId: number,
  currentFingerprints: string[]
) {
  const now = new Date()
  const future30Days = DateTime.now().setZone(APP_TIMEZONE).plus({ days: 30 }).toJSDate()

  await prisma.showtime.updateMany({
    where: {
      theaterId,
      startTime: { gte: now, lte: future30Days },
      status: 'SCHEDULED',
      fingerprint: {
        notIn: currentFingerprints.length > 0 ? currentFingerprints : ['__never_match__'],
      },
    },
    data: {
      status: 'CANCELED',
      lastVerifiedAt: new Date(),
    },
  })
}

export async function disconnectPrisma() {
  await prisma.$disconnect()
}
