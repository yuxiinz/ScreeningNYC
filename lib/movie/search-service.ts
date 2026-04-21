import { getReleaseYear } from '@/lib/movie/display'
import type {
  MovieSearchResult,
  MovieSearchStatus,
} from '@/lib/movie/search-types'
import { prisma } from '@/lib/prisma'
import { normalizeMovieName } from '@/lib/movie/normalize'

export type LocalMovieSearchItem = MovieSearchResult & {
  tmdbId: number | null
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

  const seen = new Map<string, typeof movies[number]>()

  for (const movie of movies) {
    const firstShowtime = movie.showtimes[0]
    const normalizedTitle = normalizeMovieName(movie.title)
    const year = getReleaseYear(movie.releaseDate)
    const dedupeKey = firstShowtime
      ? `${normalizedTitle}|${firstShowtime.startTime.toISOString()}|${firstShowtime.theaterId}`
      : `${normalizedTitle}|${year ?? ''}`

    if (!seen.has(dedupeKey)) {
      seen.set(dedupeKey, movie)
    }
  }

  const dedupedMovies = [...seen.values()]

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
