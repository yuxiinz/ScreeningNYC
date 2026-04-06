import { getReleaseYear } from '@/lib/movie/display'
import type {
  MovieSearchResult,
  MovieSearchStatus,
} from '@/lib/movie/search-types'
import { prisma } from '@/lib/prisma'

export type LocalMovieSearchItem = MovieSearchResult & {
  tmdbId: number | null
}

function normalizeSearchTitle(title?: string | null) {
  return (title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export async function searchLocalMovies(
  query: string,
  { take = 8 }: { take?: number } = {}
): Promise<LocalMovieSearchItem[]> {
  const trimmedQuery = query.trim()

  if (trimmedQuery.length < 2) {
    return []
  }

  const now = new Date()

  const movies = await prisma.movie.findMany({
    where: {
      OR: [
        {
          title: {
            contains: trimmedQuery,
            mode: 'insensitive',
          },
        },
        {
          originalTitle: {
            contains: trimmedQuery,
            mode: 'insensitive',
          },
        },
      ],
    },
    include: {
      showtimes: {
        where: {
          startTime: {
            gt: now,
          },
          status: 'SCHEDULED',
        },
        select: {
          startTime: true,
          theaterId: true,
        },
        take: 1,
      },
    },
    take,
    orderBy: {
      updatedAt: 'desc',
    },
  })

  const dedupedMovies = movies.filter((movie, index, items) => {
    const firstShowtime = movie.showtimes[0]
    const normalizedTitle = normalizeSearchTitle(movie.title)
    const year = getReleaseYear(movie.releaseDate)
    const dedupeKey = firstShowtime
      ? `${normalizedTitle}|${firstShowtime.startTime.toISOString()}|${firstShowtime.theaterId}`
      : `${normalizedTitle}|${year ?? ''}`

    return (
      items.findIndex((candidate) => {
        const candidateFirstShowtime = candidate.showtimes[0]
        const candidateTitle = normalizeSearchTitle(candidate.title)
        const candidateYear = getReleaseYear(candidate.releaseDate)
        const candidateKey = candidateFirstShowtime
          ? `${candidateTitle}|${candidateFirstShowtime.startTime.toISOString()}|${candidateFirstShowtime.theaterId}`
          : `${candidateTitle}|${candidateYear ?? ''}`

        return candidateKey === dedupeKey
      }) === index
    )
  })

  return dedupedMovies.map((movie) => {
    let status: MovieSearchStatus = 'NONE'

    if (movie.showtimes.length > 0) {
      status = 'NOW_SHOWING'
    }

    return {
      id: movie.id,
      tmdbId: movie.tmdbId ?? null,
      title: movie.title,
      year: getReleaseYear(movie.releaseDate),
      status,
    }
  })
}
