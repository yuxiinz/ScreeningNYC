import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import type { Movie } from '@prisma/client'
import { DateTime } from 'luxon'
import { prisma } from '../../prisma'
import { APP_TIMEZONE } from '../../timezone'
import type { TmdbMovie } from './tmdb_service'
import { canonicalizeTitle } from './tmdb_service'
import { findLocalMovieByImportMatch } from '@/lib/movie/match'
import {
  syncMovieDirectors,
  syncMovieTags,
} from '@/lib/movie/relations'

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
  titleCandidates?: string[]
  directorText?: string
  releaseYear?: number
  releaseDate?: Date
  runtimeMinutes?: number
  overview?: string
  posterUrl?: string
  imdbUrl?: string
  doubanUrl?: string
  letterboxdUrl?: string
  officialSiteUrl?: string
  genresText?: string
  productionCountriesText?: string
  preferTitle?: boolean
}

type DbClient = typeof prisma | Prisma.TransactionClient

export class MovieIdentityConflictError extends Error {
  constructor(message = 'Existing movie matched the import signature with a different TMDB id.') {
    super(message)
    this.name = 'MovieIdentityConflictError'
  }
}

let showtimeShownTitleColumnSupportPromise: Promise<boolean> | null = null
const SHOWTIME_CANCEL_LOOKAHEAD_DAYS = 120

function normalizeWhitespace(input?: string | null): string {
  return (input || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim()
}

function normalizeComparableMovieTitle(input?: string | null): string {
  return canonicalizeTitle(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function scoreMovieTitleNoise(input?: string | null): number {
  const title = normalizeWhitespace(input)
  if (!title) return 0

  let score = 0

  if (/^.+?\s+presents:?\s+.+/i.test(title)) {
    score += 6
  }

  if (
    /\s+\+\s*(?:q(?:\s*&\s*|\s+and\s+)a|q&a|qa|intro(?:duction)?|seminar|discussion|panel|conversation|in person)\b/i.test(
      title
    )
  ) {
    score += 5
  }

  if (/\s+\|\s+.+/.test(title)) {
    score += 4
  }

  if (
    /\s*[-–—]\s*(4K\s*DCP|DCP|35\s*MM|16\s*MM|70\s*MM|IMAX|DIGITAL|BLU[\s-]?RAY|SUPER[\s-]?8(?:MM)?)\b/i.test(
      title
    )
  ) {
    score += 4
  }

  if (/[-–—:|]\s*$/.test(title)) {
    score += 3
  }

  return score
}

function shouldPreferIncomingMovieTitle(
  existingTitle?: string | null,
  incomingTitle?: string | null
): boolean {
  const existing = canonicalizeTitle(existingTitle || '')
  const incoming = canonicalizeTitle(incomingTitle || '')

  if (!incoming || existing === incoming) {
    return false
  }

  if (!existing) {
    return true
  }

  const existingNoise = scoreMovieTitleNoise(existing)
  const incomingNoise = scoreMovieTitleNoise(incoming)

  if (incomingNoise >= existingNoise) {
    return false
  }

  const existingComparable = normalizeComparableMovieTitle(existing)
  const incomingComparable = normalizeComparableMovieTitle(incoming)

  if (!existingComparable || !incomingComparable) {
    return false
  }

  if (
    existingComparable.includes(incomingComparable) ||
    incomingComparable.includes(existingComparable)
  ) {
    return true
  }

  return existingNoise > 0 && incoming.length < existing.length
}

function releaseYearToDate(year?: number): Date | undefined {
  if (!year || Number.isNaN(year)) return undefined
  return new Date(`${year}-01-01T00:00:00.000Z`)
}

function getFallbackReleaseDate(fallback?: FallbackMovieData) {
  return fallback?.releaseDate || releaseYearToDate(fallback?.releaseYear)
}

function isYearOnlyReleaseDate(date?: Date | null) {
  if (!date) return false

  return (
    date.getUTCMonth() === 0 &&
    date.getUTCDate() === 1 &&
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  )
}

export function chooseMergedReleaseDate(params: {
  existing: Pick<Movie, 'tmdbId' | 'releaseDate'>
  tmdb?: TmdbMovie | null
  fallbackReleaseDate?: Date
}) {
  const { existing, tmdb, fallbackReleaseDate } = params

  if (tmdb?.releaseDate) {
    if (!existing.releaseDate) {
      return tmdb.releaseDate
    }

    if (!existing.tmdbId || isYearOnlyReleaseDate(existing.releaseDate)) {
      return tmdb.releaseDate
    }
  }

  return existing.releaseDate || tmdb?.releaseDate || fallbackReleaseDate
}

function isBadPosterUrl(url?: string | null): boolean {
  const s = normalizeWhitespace(url).toLowerCase()
  if (!s) return true

  return (
    s.includes('ticketing.uswest.veezi.com/media/poster') ||
    s.includes('ticketing.us.veezi.com/media/poster') ||
    s.includes('cropped-logo_metrograph') ||
    s.includes('/logo_metrograph') ||
    s.includes('metrographred.png') ||
    s.includes('bam_logo.gif') ||
    s.includes('/static/img/logo/')
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

  return existingGood || fallbackGood || undefined
}

async function supportsShowtimeShownTitleColumn(): Promise<boolean> {
  if (!showtimeShownTitleColumnSupportPromise) {
    showtimeShownTitleColumnSupportPromise = prisma
      .$queryRawUnsafe<Array<{ exists: boolean }>>(
        `select exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'Showtime'
            and column_name = 'shownTitle'
        ) as "exists"`
      )
      .then((rows) => Boolean(rows[0]?.exists))
      .catch(() => false)
  }

  return showtimeShownTitleColumnSupportPromise
}

export function normalizeFormat(raw?: string | null): string {
  const s = normalizeWhitespace(raw).toLowerCase()

  if (!s) return 'Standard'
  if (s.includes('70mm')) return '70mm'
  if (s.includes('35mm')) return '35mm'
  if (s.includes('16mm')) return '16mm'
  if (s.includes('super-8') || s.includes('super 8')) return 'Super 8'
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

function buildMovieCreateData(
  tmdb: TmdbMovie | null,
  fallback: FallbackMovieData | undefined,
  preferredTitle: string,
  fallbackReleaseDate: Date | undefined
) {
  return {
    ...(tmdb?.tmdbId ? { tmdbId: tmdb.tmdbId } : {}),
    title: preferredTitle,
    originalTitle: tmdb?.originalTitle,
    releaseDate: tmdb?.releaseDate || fallbackReleaseDate,
    runtimeMinutes: tmdb?.runtimeMinutes || fallback?.runtimeMinutes,
    overview: tmdb?.overview || fallback?.overview,
    posterUrl: choosePosterUrl({
      tmdbPosterUrl: tmdb?.posterUrl,
      fallbackPosterUrl: fallback?.posterUrl,
    }),
    backdropUrl: tmdb?.backdropUrl,
    imdbUrl: tmdb?.imdbUrl || fallback?.imdbUrl,
    doubanUrl: fallback?.doubanUrl,
    letterboxdUrl: fallback?.letterboxdUrl,
    officialSiteUrl: tmdb?.officialSiteUrl || fallback?.officialSiteUrl,
    genresText: tmdb?.genresText || fallback?.genresText,
    productionCountriesText:
      tmdb?.productionCountriesText || fallback?.productionCountriesText,
    directorText: tmdb?.directorText || fallback?.directorText,
    castText: tmdb?.castText,
  }
}

function buildMovieMergeData(params: {
  existing: Movie
  tmdb?: TmdbMovie | null
  fallback?: FallbackMovieData
  preferredTitle?: string
  fallbackReleaseDate?: Date
  preferIncomingTitle?: boolean
}) {
  const { existing, tmdb, fallback, preferredTitle, fallbackReleaseDate } = params
  const existingProductionCountriesText =
    'productionCountriesText' in existing
      ? (existing.productionCountriesText ?? null)
      : null

  return {
    title:
      params.preferIncomingTitle && preferredTitle ? preferredTitle : existing.title,
    originalTitle: existing.originalTitle || tmdb?.originalTitle,
    releaseDate: chooseMergedReleaseDate({
      existing,
      tmdb,
      fallbackReleaseDate,
    }),
    runtimeMinutes: existing.runtimeMinutes || tmdb?.runtimeMinutes || fallback?.runtimeMinutes,
    overview: existing.overview || tmdb?.overview || fallback?.overview,
    posterUrl: choosePosterUrl({
      tmdbPosterUrl: tmdb?.posterUrl,
      existingPosterUrl: existing.posterUrl,
      fallbackPosterUrl: fallback?.posterUrl,
    }),
    backdropUrl: existing.backdropUrl || tmdb?.backdropUrl,
    imdbUrl: existing.imdbUrl || tmdb?.imdbUrl || fallback?.imdbUrl,
    doubanUrl: existing.doubanUrl || fallback?.doubanUrl,
    letterboxdUrl: existing.letterboxdUrl || fallback?.letterboxdUrl,
    officialSiteUrl:
      existing.officialSiteUrl || tmdb?.officialSiteUrl || fallback?.officialSiteUrl,
    genresText: existing.genresText || tmdb?.genresText || fallback?.genresText,
    productionCountriesText:
      existingProductionCountriesText || tmdb?.productionCountriesText || fallback?.productionCountriesText,
    directorText: existing.directorText || tmdb?.directorText || fallback?.directorText,
    castText: existing.castText || tmdb?.castText,
  }
}

export async function mergeMovieMetadata(
  movieId: number,
  fallback: FallbackMovieData,
  db: DbClient = prisma
) {
  const existing = await db.movie.findUnique({
    where: {
      id: movieId,
    },
  })

  if (!existing) {
    return null
  }

  const normalizedFallbackTitle = canonicalizeTitle(fallback.title)

  return db.movie.update({
    where: { id: existing.id },
    data: buildMovieMergeData({
      existing,
      fallback: {
        ...fallback,
        title: normalizedFallbackTitle,
      },
      fallbackReleaseDate: getFallbackReleaseDate(fallback),
      preferredTitle: normalizedFallbackTitle,
      preferIncomingTitle:
        fallback.preferTitle ||
        shouldPreferIncomingMovieTitle(existing.title, normalizedFallbackTitle),
    }),
  })
}

export async function mergeMovieImportLinks(
  movieId: number,
  fallback: Pick<FallbackMovieData, 'imdbUrl' | 'doubanUrl' | 'letterboxdUrl'>,
  db: DbClient = prisma
) {
  const existing = await db.movie.findUnique({
    where: {
      id: movieId,
    },
  })

  if (!existing) {
    return null
  }

  const data = {
    imdbUrl: existing.imdbUrl || fallback.imdbUrl,
    doubanUrl: existing.doubanUrl || fallback.doubanUrl,
    letterboxdUrl: existing.letterboxdUrl || fallback.letterboxdUrl,
  }

  if (
    data.imdbUrl === existing.imdbUrl &&
    data.doubanUrl === existing.doubanUrl &&
    data.letterboxdUrl === existing.letterboxdUrl
  ) {
    return existing
  }

  return db.movie.update({
    where: { id: existing.id },
    data,
  })
}

export async function upsertLocalMovie(fallback: FallbackMovieData) {
  const canonicalTitle = canonicalizeTitle(fallback.title)
  const existing = await findLocalMovieByImportMatch({
    title: canonicalTitle,
    titleCandidates: fallback.titleCandidates,
    directorText: fallback.directorText,
    releaseYear: fallback.releaseYear,
    imdbId: fallback.imdbUrl,
    doubanUrl: fallback.doubanUrl,
    letterboxdUrl: fallback.letterboxdUrl,
  })
  const releaseDate = getFallbackReleaseDate(fallback)

  if (existing) {
    const movie = await mergeMovieMetadata(existing.id, {
      ...fallback,
      title: canonicalTitle,
    })

    if (!movie) {
      throw new Error(`Movie ${existing.id} disappeared during local upsert.`)
    }

    await syncMovieTags(movie.id, movie.genresText)
    await syncMovieDirectors(movie.id, [])

    return movie
  }

  const movie = await prisma.movie.create({
    data: buildMovieCreateData(
      null,
      {
        ...fallback,
        title: canonicalTitle,
      },
      canonicalTitle,
      releaseDate
    ),
  })

  await syncMovieTags(movie.id, movie.genresText)
  await syncMovieDirectors(movie.id, [])

  return movie
}

export async function upsertMovie(tmdb: TmdbMovie, fallback?: FallbackMovieData) {
  const fallbackTitle = canonicalizeTitle(fallback?.title || tmdb.title || 'Untitled')
  const fallbackReleaseDate = getFallbackReleaseDate(fallback)
  const preferredTitle =
    fallback?.preferTitle && fallbackTitle ? fallbackTitle : tmdb.title || fallbackTitle
  const releaseYear =
    fallback?.releaseYear ||
    (fallbackReleaseDate ? fallbackReleaseDate.getUTCFullYear() : undefined) ||
    (tmdb.releaseDate ? new Date(tmdb.releaseDate).getUTCFullYear() : undefined)

  const matchInput = {
    title: fallbackTitle,
    titleCandidates: fallback?.titleCandidates,
    directorText: fallback?.directorText || tmdb.directorText,
    releaseYear,
    imdbId: fallback?.imdbUrl || tmdb.imdbUrl,
    doubanUrl: fallback?.doubanUrl,
    letterboxdUrl: fallback?.letterboxdUrl,
  }

  const movie = await prisma.$transaction(async (tx) => {
    if (tmdb.tmdbId) {
      const existingByTmdbId = await tx.movie.findUnique({
        where: {
          tmdbId: tmdb.tmdbId,
        },
      })

      if (existingByTmdbId) {
        return tx.movie.update({
          where: {
            id: existingByTmdbId.id,
          },
          data: buildMovieMergeData({
            existing: existingByTmdbId,
            tmdb,
            fallback,
            preferredTitle,
            fallbackReleaseDate,
            preferIncomingTitle: true,
          }),
        })
      }
    }

    const existingBySignature = await findLocalMovieByImportMatch(matchInput, tx)

    if (existingBySignature) {
      if (
        tmdb.tmdbId &&
        existingBySignature.tmdbId &&
        existingBySignature.tmdbId !== tmdb.tmdbId
      ) {
        const conflictTitle = preferredTitle || fallbackTitle || tmdb.title || 'Untitled'
        const conflictDirector = matchInput.directorText || tmdb.directorText || 'n/a'
        const conflictYear = releaseYear ?? 'n/a'
        const conflictMessage = [
          'Existing movie matched the import signature with a different TMDB id.',
          `title=${conflictTitle}`,
          `existingId=${existingBySignature.id}`,
          `existingTmdbId=${existingBySignature.tmdbId}`,
          `incomingTmdbId=${tmdb.tmdbId}`,
          `director=${conflictDirector}`,
          `year=${conflictYear}`,
          tmdb.matchedQueryTitle ? `matchedQuery=${tmdb.matchedQueryTitle}` : '',
        ]
          .filter(Boolean)
          .join(' ')

        throw new MovieIdentityConflictError(conflictMessage)
      }

      return tx.movie.update({
        where: {
          id: existingBySignature.id,
        },
        data: {
          ...buildMovieMergeData({
            existing: existingBySignature,
            tmdb,
            fallback,
            preferredTitle,
            fallbackReleaseDate,
            preferIncomingTitle:
              fallback?.preferTitle ||
              shouldPreferIncomingMovieTitle(existingBySignature.title, preferredTitle),
          }),
          ...(tmdb.tmdbId && !existingBySignature.tmdbId
            ? { tmdbId: tmdb.tmdbId }
            : {}),
        },
      })
    }

    try {
      return await tx.movie.create({
        data: buildMovieCreateData(tmdb, fallback, preferredTitle, fallbackReleaseDate),
      })
    } catch (error) {
      if (
        tmdb.tmdbId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existingByTmdbId = await tx.movie.findUnique({
          where: {
            tmdbId: tmdb.tmdbId,
          },
        })

        if (existingByTmdbId) {
          return tx.movie.update({
            where: {
              id: existingByTmdbId.id,
            },
            data: buildMovieMergeData({
              existing: existingByTmdbId,
              tmdb,
              fallback,
              preferredTitle,
              fallbackReleaseDate,
              preferIncomingTitle: true,
            }),
          })
        }
      }

      throw error
    }
  })

  await syncMovieTags(movie.id, movie.genresText || fallback?.genresText)
  await syncMovieDirectors(movie.id, tmdb.directorCredits || [])

  return movie
}

export async function upsertShowtime(params: {
  movieId: number
  theaterId: number
  formatId?: number
  startTime: Date
  endTime?: Date
  runtimeMinutes?: number
  ticketUrl?: string
  shownTitle?: string
  sourceUrl?: string
  sourceShowtimeId?: string
  fingerprint: string
  sourceName: string
}) {
  const shownTitleSupported = await supportsShowtimeShownTitleColumn()
  const updateData = {
    movieId: params.movieId,
    runtimeMinutes: params.runtimeMinutes,
    endTime: params.endTime,
    ticketUrl: params.ticketUrl,
    sourceUrl: params.sourceUrl,
    sourceName: params.sourceName,
    sourceShowtimeId: params.sourceShowtimeId,
    formatId: params.formatId,
    startTime: params.startTime,
    status: 'SCHEDULED' as const,
    lastVerifiedAt: new Date(),
    ...(shownTitleSupported ? { shownTitle: params.shownTitle } : {}),
  }
  const createData = {
    movieId: params.movieId,
    theaterId: params.theaterId,
    formatId: params.formatId,
    startTime: params.startTime,
    endTime: params.endTime,
    runtimeMinutes: params.runtimeMinutes,
    ticketUrl: params.ticketUrl,
    sourceUrl: params.sourceUrl,
    sourceName: params.sourceName,
    sourceShowtimeId: params.sourceShowtimeId,
    fingerprint: params.fingerprint,
    status: 'SCHEDULED' as const,
    lastVerifiedAt: new Date(),
    ...(shownTitleSupported ? { shownTitle: params.shownTitle } : {}),
  }

  return prisma.showtime.upsert({
    where: { fingerprint: params.fingerprint },
    update: updateData,
    create: createData,
  })
}

export async function markMissingShowtimesAsCanceled(
  theaterId: number,
  currentFingerprints: string[]
) {
  const now = new Date()
  const futureLookahead = DateTime.now()
    .setZone(APP_TIMEZONE)
    .plus({ days: SHOWTIME_CANCEL_LOOKAHEAD_DAYS })
    .toJSDate()

  await prisma.showtime.updateMany({
    where: {
      theaterId,
      startTime: { gte: now, lte: futureLookahead },
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

export async function getIngestTableCounts() {
  const [
    theaterCount,
    movieCount,
    formatCount,
    showtimeCount,
    scheduledShowtimeCount,
    canceledShowtimeCount,
  ] = await Promise.all([
    prisma.theater.count(),
    prisma.movie.count(),
    prisma.format.count(),
    prisma.showtime.count(),
    prisma.showtime.count({
      where: {
        status: 'SCHEDULED',
      },
    }),
    prisma.showtime.count({
      where: {
        status: 'CANCELED',
      },
    }),
  ])

  return {
    theaterCount,
    movieCount,
    formatCount,
    showtimeCount,
    scheduledShowtimeCount,
    canceledShowtimeCount,
  }
}

export async function backfillMissingShowtimeEndTimesBatch(batchSize = 500): Promise<number> {
  const rows = await prisma.showtime.findMany({
    where: {
      endTime: null,
      OR: [
        {
          runtimeMinutes: {
            gt: 0,
          },
        },
        {
          movie: {
            runtimeMinutes: {
              gt: 0,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      startTime: true,
      runtimeMinutes: true,
      movie: {
        select: {
          runtimeMinutes: true,
        },
      },
    },
    orderBy: {
      id: 'asc',
    },
    take: batchSize,
  })

  if (rows.length === 0) return 0

  let updatedCount = 0

  for (const row of rows) {
    const runtimeMinutes = row.runtimeMinutes ?? row.movie.runtimeMinutes
    if (!runtimeMinutes || runtimeMinutes <= 0) continue

    const endTime = new Date(row.startTime.getTime() + runtimeMinutes * 60 * 1000)
    await prisma.showtime.update({
      where: { id: row.id },
      data: { endTime },
    })
    updatedCount += 1
  }

  return updatedCount
}

export async function deleteExpiredShowtimesBatch(batchSize = 1000): Promise<number> {
  const now = new Date()

  const rows = await prisma.showtime.findMany({
    where: {
      OR: [
        {
          endTime: {
            lt: now,
          },
        },
        {
          endTime: null,
          startTime: {
            lt: now,
          },
        },
      ],
    },
    select: {
      id: true,
    },
    orderBy: {
      startTime: 'asc',
    },
    take: batchSize,
  })

  if (rows.length === 0) return 0

  const deleted = await prisma.showtime.deleteMany({
    where: {
      id: {
        in: rows.map((row) => row.id),
      },
    },
  })

  return deleted.count
}

export async function disconnectPrisma() {
  await prisma.$disconnect()
}
