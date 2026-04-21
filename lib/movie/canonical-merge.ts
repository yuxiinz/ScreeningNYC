import type { Movie, Prisma } from '@prisma/client'

import {
  buildDirectorSetSignature,
  collectCanonicalMovieTitleCandidates,
  isLikelyCanonicalDuplicate,
  scoreCanonicalMovieTarget,
} from '@/lib/movie/canonical'
import { prisma } from '@/lib/prisma'
import { mergeMovieRecords } from '@/lib/movie/merge-service'

type DbClient = typeof prisma | Prisma.TransactionClient

type MergeCandidateMovie = Pick<
  Movie,
  'id' | 'title' | 'originalTitle' | 'directorText' | 'releaseDate' | 'tmdbId' | 'posterUrl' | 'imdbUrl'
> & {
  _count: {
    showtimes: number
  }
}

function buildCandidateTitleFilters(values: string[]): Prisma.MovieWhereInput[] {
  return values.flatMap((value) => {
    const filters: Prisma.MovieWhereInput[] = [
      {
        title: {
          equals: value,
          mode: 'insensitive',
        },
      },
      {
        originalTitle: {
          equals: value,
          mode: 'insensitive',
        },
      },
    ]

    const shouldUseContains =
      value.length >= 4 || /\s/.test(value) || /[^\x00-\x7F]/.test(value)

    if (shouldUseContains) {
      filters.push(
        {
          title: {
            contains: value,
            mode: 'insensitive',
          },
        },
        {
          originalTitle: {
            contains: value,
            mode: 'insensitive',
          },
        }
      )
    }

    return filters
  })
}

export async function findCanonicalMergeCandidates(
  movie: Pick<Movie, 'id' | 'title' | 'originalTitle' | 'directorText' | 'releaseDate' | 'tmdbId'>,
  params: {
    desiredTmdbId?: number
    seedTitles?: Array<string | undefined>
  },
  db: DbClient = prisma
) {
  const titleCandidates = collectCanonicalMovieTitleCandidates(movie, params.seedTitles)
  const whereClauses = buildCandidateTitleFilters(titleCandidates)

  if (params.desiredTmdbId) {
    whereClauses.push({
      tmdbId: params.desiredTmdbId,
    })
  }

  if (whereClauses.length === 0) {
    return []
  }

  const rows = await db.movie.findMany({
    where: {
      id: {
        not: movie.id,
      },
      OR: whereClauses,
    },
    select: {
      id: true,
      title: true,
      originalTitle: true,
      directorText: true,
      releaseDate: true,
      tmdbId: true,
      posterUrl: true,
      imdbUrl: true,
      _count: {
        select: {
          showtimes: true,
        },
      },
    },
    take: 80,
    orderBy: {
      id: 'asc',
    },
  })

  return rows.filter((candidate) =>
    isLikelyCanonicalDuplicate(movie, candidate, params.seedTitles)
  )
}

export async function reconcileCanonicalMovie(params: {
  movieId: number
  desiredTmdbId?: number
  seedTitles?: Array<string | undefined>
}) {
  const currentMovie = await prisma.movie.findUnique({
    where: { id: params.movieId },
    select: {
      id: true,
      title: true,
      originalTitle: true,
      directorText: true,
      releaseDate: true,
      tmdbId: true,
      posterUrl: true,
      imdbUrl: true,
      _count: {
        select: {
          showtimes: true,
        },
      },
    },
  })

  if (!currentMovie) {
    throw new Error(`Movie ${params.movieId} was not found during canonical reconciliation.`)
  }

  const candidates = await findCanonicalMergeCandidates(
    currentMovie,
    {
      desiredTmdbId: params.desiredTmdbId,
      seedTitles: params.seedTitles,
    },
    prisma
  )

  if (candidates.length === 0) {
    const movie = await prisma.movie.findUnique({
      where: { id: currentMovie.id },
    })

    if (!movie) {
      throw new Error(`Movie ${currentMovie.id} disappeared during reconciliation.`)
    }

    return movie
  }

  const allRows: MergeCandidateMovie[] = [currentMovie, ...candidates]
  const target = [...allRows].sort((left, right) => {
    const scoreDiff =
      scoreCanonicalMovieTarget(right, params.desiredTmdbId) -
      scoreCanonicalMovieTarget(left, params.desiredTmdbId)

    if (scoreDiff !== 0) {
      return scoreDiff
    }

    return left.id - right.id
  })[0]

  const sourceRows = allRows
    .filter((row) => row.id !== target.id)
    .sort((left, right) => {
      if (left.tmdbId && !right.tmdbId) return 1
      if (!left.tmdbId && right.tmdbId) return -1

      const leftDirectorCount = buildDirectorSetSignature(left.directorText).split('|').filter(Boolean).length
      const rightDirectorCount = buildDirectorSetSignature(right.directorText).split('|').filter(Boolean).length
      if (leftDirectorCount !== rightDirectorCount) {
        return leftDirectorCount - rightDirectorCount
      }

      return left.id - right.id
    })

  for (const sourceRow of sourceRows) {
    await mergeMovieRecords(sourceRow.id, target.id)
  }

  const reconciledMovie = await prisma.movie.findUnique({
    where: { id: target.id },
  })

  if (!reconciledMovie) {
    throw new Error(`Movie ${target.id} disappeared after canonical reconciliation.`)
  }

  return reconciledMovie
}
