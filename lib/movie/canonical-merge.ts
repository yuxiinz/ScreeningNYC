import type { Movie, Prisma } from '@prisma/client'

import {
  collectCanonicalMovieTitleCandidates,
  isLikelyCanonicalDuplicate,
  planCanonicalMovieMerge,
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

function buildCanonicalMergePlanMovie(row: MergeCandidateMovie) {
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.originalTitle,
    directorText: row.directorText,
    releaseDate: row.releaseDate,
    tmdbId: row.tmdbId,
    posterUrl: row.posterUrl,
    imdbUrl: row.imdbUrl,
    showtimeCount: row._count.showtimes,
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

  const mergePlan = planCanonicalMovieMerge({
    currentMovie: buildCanonicalMergePlanMovie(currentMovie),
    candidates: candidates.map(buildCanonicalMergePlanMovie),
    desiredTmdbId: params.desiredTmdbId,
  })

  if (mergePlan.kind === 'conflict') {
    const rowSummary = mergePlan.rows
      .map((row) => `${row.id}:${row.tmdbId ?? 'local'}:${row.title}`)
      .join(' | ')

    throw new Error(
      `[canonical] Refusing to reconcile movie ${currentMovie.id}: candidate set spans multiple TMDB ids (${mergePlan.tmdbIds.join(', ')}). rows=${rowSummary}`
    )
  }

  for (const sourceRow of mergePlan.sources) {
    await mergeMovieRecords(sourceRow.id, mergePlan.target.id)
  }

  const reconciledMovie = await prisma.movie.findUnique({
    where: { id: mergePlan.target.id },
  })

  if (!reconciledMovie) {
    throw new Error(`Movie ${mergePlan.target.id} disappeared after canonical reconciliation.`)
  }

  return reconciledMovie
}
