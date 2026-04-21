import { Prisma } from '@prisma/client'
import { DateTime } from 'luxon'
import { prisma } from '../../prisma'
import { APP_TIMEZONE } from '../../timezone'
import type { TmdbMovie } from './tmdb-service'
import { canonicalizeTitle } from '../core/screening-title'
import { findLocalMovieByImportMatch } from '@/lib/movie/match'
import {
  syncMovieDirectors,
  syncMovieTags,
} from '@/lib/movie/relations'
import { buildFingerprint } from '../core/fingerprint'
import {
  type FallbackMovieData,
  buildMovieCreateData,
  buildMovieMergeData,
  mergeMovieMetadata,
  chooseMergedReleaseDate,
  shouldPreferIncomingMovieTitle,
  getFallbackReleaseDate,
} from '@/lib/movie/movie-data'
import { reconcileCanonicalMovie } from '@/lib/movie/merge-service'


type PersistConfig = {
  theaterName: string
  theaterSlug: string
  sourceName: string
  officialSiteUrl?: string
  address?: string
  latitude?: number
  longitude?: number
}

type DbClient = typeof prisma | Prisma.TransactionClient

export class MovieIdentityConflictError extends Error {
  constructor(message = 'Existing movie matched the import signature with a different TMDB id.') {
    super(message)
    this.name = 'MovieIdentityConflictError'
  }
}

const SHOWTIME_CANCEL_LOOKAHEAD_DAYS = 120

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

    return reconcileCanonicalMovie({
      movieId: movie.id,
      seedTitles: [
        fallback.title,
        ...(fallback.titleCandidates || []),
      ],
    })
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

  return reconcileCanonicalMovie({
    movieId: movie.id,
    seedTitles: [
      fallback.title,
      ...(fallback.titleCandidates || []),
    ],
  })
}

export async function upsertMovie(tmdb: TmdbMovie, fallback?: FallbackMovieData) {
  const fallbackTitle = canonicalizeTitle(fallback?.title || tmdb.title || 'Untitled')
  const fallbackReleaseDate = getFallbackReleaseDate(fallback)
  const preferredTitle = canonicalizeTitle(tmdb.title || fallbackTitle || 'Untitled')
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

  const reconciledMovie = await reconcileCanonicalMovie({
    movieId: movie.id,
    desiredTmdbId: tmdb.tmdbId,
    seedTitles: [
      fallback?.title,
      ...(fallback?.titleCandidates || []),
      tmdb.title,
      tmdb.originalTitle,
      tmdb.matchedQueryTitle,
    ],
  })

  await syncMovieTags(reconciledMovie.id, reconciledMovie.genresText || fallback?.genresText)
  await syncMovieDirectors(reconciledMovie.id, tmdb.directorCredits || [])

  return reconciledMovie
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
  const sharedData = {
    movieId: params.movieId,
    formatId: params.formatId,
    startTime: params.startTime,
    endTime: params.endTime,
    runtimeMinutes: params.runtimeMinutes,
    ticketUrl: params.ticketUrl,
    sourceUrl: params.sourceUrl,
    sourceName: params.sourceName,
    sourceShowtimeId: params.sourceShowtimeId,
    status: 'SCHEDULED' as const,
    lastVerifiedAt: new Date(),
    shownTitle: params.shownTitle,
  }

  return prisma.showtime.upsert({
    where: { fingerprint: params.fingerprint },
    update: sharedData,
    create: {
      ...sharedData,
      theaterId: params.theaterId,
      fingerprint: params.fingerprint,
    },
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

