import type { Movie, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canonicalizeTitle } from '@/lib/ingest/core/screening_title'
import { normalizeWhitespace } from '@/lib/ingest/core/text'
import { normalizeMovieName } from '@/lib/movie/normalize'
import { pickDistinctOriginalTitle } from '@/lib/movie/canonical'
import type { TmdbMovie } from '@/lib/ingest/services/tmdb_service'

type DbClient = typeof prisma | Prisma.TransactionClient

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

export function shouldPreferIncomingMovieTitle(
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

  const existingComparable = normalizeMovieName(existing)
  const incomingComparable = normalizeMovieName(incoming)

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

function chooseCanonicalMovieTitle(params: {
  existing?: Pick<Movie, 'tmdbId' | 'title'>
  tmdb?: TmdbMovie | null
  preferredTitle?: string
  preferIncomingTitle?: boolean
}) {
  if (params.tmdb?.title) {
    return canonicalizeTitle(params.tmdb.title) || params.tmdb.title
  }

  if (params.existing?.tmdbId) {
    return params.existing.title
  }

  if (params.preferIncomingTitle && params.preferredTitle) {
    return params.preferredTitle
  }

  return params.existing?.title || params.preferredTitle || params.tmdb?.title || 'Untitled'
}

function chooseCanonicalOriginalTitle(params: {
  existing?: Pick<Movie, 'originalTitle'>
  preferredTitle: string
  tmdb?: TmdbMovie | null
  fallback?: FallbackMovieData
}) {
  return (
    pickDistinctOriginalTitle(params.preferredTitle, [
      params.existing?.originalTitle || undefined,
      params.tmdb?.originalTitle,
      params.fallback?.title,
      ...(params.fallback?.titleCandidates || []),
    ]) ||
    canonicalizeTitle(
      params.existing?.originalTitle || params.tmdb?.originalTitle || ''
    ) ||
    undefined
  )
}

export function releaseYearToDate(year?: number): Date | undefined {
  if (!year || Number.isNaN(year)) return undefined
  return new Date(`${year}-01-01T00:00:00.000Z`)
}

export function getFallbackReleaseDate(fallback?: FallbackMovieData) {
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

export function buildMovieCreateData(
  tmdb: TmdbMovie | null,
  fallback: FallbackMovieData | undefined,
  preferredTitle: string,
  fallbackReleaseDate: Date | undefined
) {
  const canonicalTitle = chooseCanonicalMovieTitle({
    tmdb,
    preferredTitle,
    preferIncomingTitle: true,
  })

  return {
    ...(tmdb?.tmdbId ? { tmdbId: tmdb.tmdbId } : {}),
    title: canonicalTitle,
    originalTitle: chooseCanonicalOriginalTitle({
      preferredTitle: canonicalTitle,
      tmdb,
      fallback,
    }),
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

export function buildMovieMergeData(params: {
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
  const canonicalTitle = chooseCanonicalMovieTitle({
    existing,
    tmdb,
    preferredTitle,
    preferIncomingTitle: params.preferIncomingTitle,
  })

  return {
    title: canonicalTitle,
    originalTitle: chooseCanonicalOriginalTitle({
      existing,
      preferredTitle: canonicalTitle,
      tmdb,
      fallback,
    }),
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
