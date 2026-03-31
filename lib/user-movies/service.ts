import { prisma } from '@/lib/prisma'
import {
  getReviewWordCount,
  normalizeReviewText,
} from '@/lib/user-movies/review'

export type MovieCollectionState = {
  inWant: boolean
  inWatched: boolean
}

export class WantRemovalConfirmationRequiredError extends Error {
  constructor(message = 'Movie is still in want list.') {
    super(message)
    this.name = 'WantRemovalConfirmationRequiredError'
  }
}

function getUniqueMovieIds(movieIds: number[]) {
  return [...new Set(movieIds.filter((movieId) => Number.isInteger(movieId) && movieId > 0))]
}

async function movieHasUpcomingShowtimes(movieId: number, now: Date = new Date()) {
  const showtime = await prisma.showtime.findFirst({
    where: {
      movieId,
      startTime: {
        gt: now,
      },
      status: 'SCHEDULED',
    },
    select: {
      id: true,
    },
  })

  return Boolean(showtime)
}

export async function getMovieStatesForUser(
  userId: string | null,
  movieIds: number[]
) {
  const uniqueMovieIds = getUniqueMovieIds(movieIds)
  const states = new Map<number, MovieCollectionState>()

  uniqueMovieIds.forEach((movieId) => {
    states.set(movieId, {
      inWant: false,
      inWatched: false,
    })
  })

  if (!userId || uniqueMovieIds.length === 0) {
    return states
  }

  const [watchlistItems, watchedMovies] = await prisma.$transaction([
    prisma.watchlistItem.findMany({
      where: {
        userId,
        movieId: {
          in: uniqueMovieIds,
        },
      },
      select: {
        movieId: true,
      },
    }),
    prisma.userMovieWatch.findMany({
      where: {
        userId,
        movieId: {
          in: uniqueMovieIds,
        },
      },
      select: {
        movieId: true,
      },
    }),
  ])

  watchlistItems.forEach(({ movieId }) => {
    states.set(movieId, {
      ...(states.get(movieId) || {
        inWant: false,
        inWatched: false,
      }),
      inWant: true,
    })
  })

  watchedMovies.forEach(({ movieId }) => {
    states.set(movieId, {
      ...(states.get(movieId) || {
        inWant: false,
        inWatched: false,
      }),
      inWatched: true,
    })
  })

  return states
}

export async function addWant(userId: string, movieId: number) {
  const addedWhileOnScreen = await movieHasUpcomingShowtimes(movieId)

  await prisma.watchlistItem.upsert({
    where: {
      userId_movieId: {
        userId,
        movieId,
      },
    },
    update: {},
    create: {
      userId,
      movieId,
      addedWhileOnScreen,
    },
  })

  return {
    movieId,
    inWant: true,
  }
}

export async function removeWant(userId: string, movieId: number) {
  await prisma.watchlistItem.deleteMany({
    where: {
      userId,
      movieId,
    },
  })

  return {
    movieId,
    inWant: false,
  }
}

type MarkWatchedInput = {
  confirmRemoveWant?: boolean
  preserveWatchedAt?: boolean
  rating?: number | null
  reviewText?: string | null
}

export async function markWatched(
  userId: string,
  movieId: number,
  input: MarkWatchedInput = {}
) {
  const reviewText = normalizeReviewText(input.reviewText)
  const reviewWordCount = getReviewWordCount(reviewText)

  return prisma.$transaction(async (tx) => {
    const [watchlistItem, existingWatchedMovie] = await Promise.all([
      tx.watchlistItem.findUnique({
        where: {
          userId_movieId: {
            userId,
            movieId,
          },
        },
        select: {
          id: true,
        },
      }),
      tx.userMovieWatch.findUnique({
        where: {
          userId_movieId: {
            userId,
            movieId,
          },
        },
        select: {
          watchedAt: true,
        },
      }),
    ])

    if (watchlistItem && !existingWatchedMovie && !input.confirmRemoveWant) {
      throw new WantRemovalConfirmationRequiredError()
    }

    if (watchlistItem && input.confirmRemoveWant) {
      await tx.watchlistItem.delete({
        where: {
          id: watchlistItem.id,
        },
      })
    }

    const watchedAt =
      input.preserveWatchedAt && existingWatchedMovie?.watchedAt
        ? existingWatchedMovie.watchedAt
        : new Date()

    const watchedMovie = await tx.userMovieWatch.upsert({
      where: {
        userId_movieId: {
          userId,
          movieId,
        },
      },
      update: {
        watchedAt,
        rating: input.rating ?? null,
        reviewText,
        reviewWordCount,
      },
      create: {
        userId,
        movieId,
        watchedAt,
        rating: input.rating ?? null,
        reviewText,
        reviewWordCount,
      },
      select: {
        watchedAt: true,
        rating: true,
        reviewText: true,
      },
    })

    return {
      movieId,
      inWatched: true,
      removedFromWant: Boolean(watchlistItem && input.confirmRemoveWant),
      watchedAt: watchedMovie.watchedAt.toISOString(),
      rating: watchedMovie.rating,
      reviewText: watchedMovie.reviewText,
    }
  })
}

export async function removeWatched(userId: string, movieId: number) {
  await prisma.userMovieWatch.deleteMany({
    where: {
      userId,
      movieId,
    },
  })

  return {
    movieId,
    inWatched: false,
  }
}

export async function getWantListPageData(userId: string) {
  const now = new Date()

  const items = await prisma.watchlistItem.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      createdAt: true,
      movie: {
        select: {
          id: true,
          title: true,
          releaseDate: true,
          runtimeMinutes: true,
          directorText: true,
          posterUrl: true,
          imdbUrl: true,
          doubanUrl: true,
          letterboxdUrl: true,
          showtimes: {
            where: {
              startTime: {
                gt: now,
              },
              status: 'SCHEDULED',
            },
            orderBy: {
              startTime: 'asc',
            },
            take: 3,
            select: {
              id: true,
              startTime: true,
              theater: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  return {
    totalCount: items.length,
    onScreenNowCount: items.filter((item) => item.movie.showtimes.length > 0).length,
    items,
  }
}

export async function getWatchedListPageData(userId: string) {
  const items = await prisma.userMovieWatch.findMany({
    where: {
      userId,
    },
    orderBy: {
      watchedAt: 'desc',
    },
    select: {
      watchedAt: true,
      rating: true,
      reviewText: true,
      movie: {
        select: {
          id: true,
          title: true,
          releaseDate: true,
          runtimeMinutes: true,
          directorText: true,
          posterUrl: true,
          imdbUrl: true,
          doubanUrl: true,
          letterboxdUrl: true,
        },
      },
    },
  })

  return {
    totalCount: items.length,
    items,
  }
}
