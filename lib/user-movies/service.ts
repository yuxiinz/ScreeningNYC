import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  createCollectionStateMap,
  getUniquePositiveIds,
  patchCollectionState,
} from '@/lib/user-collections/state'
import {
  getReviewWordCount,
  normalizeReviewText,
} from '@/lib/user-movies/review'

export type MovieCollectionState = {
  inWant: boolean
  inWatched: boolean
}

function toPlainRating(
  value: Prisma.Decimal | number | null | undefined
): number | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  if (typeof value === 'number') {
    return value
  }

  return value.toNumber()
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
  const createInitialState = (): MovieCollectionState => ({
    inWant: false,
    inWatched: false,
  })
  const {
    states,
    uniqueIds: uniqueMovieIds,
  } = createCollectionStateMap(movieIds, createInitialState)

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
    patchCollectionState(states, movieId, {
      inWant: true,
    }, createInitialState)
  })

  watchedMovies.forEach(({ movieId }) => {
    patchCollectionState(states, movieId, {
      inWatched: true,
    }, createInitialState)
  })

  return states
}

export async function getWantedMovieIdsForUser(
  userId: string | null,
  movieIds: number[]
) {
  const uniqueMovieIds = getUniquePositiveIds(movieIds)

  if (!userId || uniqueMovieIds.length === 0) {
    return new Set<number>()
  }

  const watchlistItems = await prisma.watchlistItem.findMany({
    where: {
      userId,
      movieId: {
        in: uniqueMovieIds,
      },
    },
    select: {
      movieId: true,
    },
  })

  return new Set(watchlistItems.map(({ movieId }) => movieId))
}

export async function addWant(userId: string, movieId: number) {
  const addedWhileOnScreen = await movieHasUpcomingShowtimes(movieId)
  const existing = await prisma.watchlistItem.findUnique({
    where: {
      userId_movieId: {
        userId,
        movieId,
      },
    },
    select: {
      id: true,
    },
  })

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
    alreadyExisted: Boolean(existing),
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
  watchedAt?: Date
  rating?: number | null
  reviewText?: string | null
}

export async function markWatched(
  userId: string,
  movieId: number,
  input: MarkWatchedInput = {}
) {
  const reviewText =
    typeof input.reviewText === 'undefined'
      ? undefined
      : normalizeReviewText(input.reviewText)
  const reviewWordCount =
    typeof reviewText === 'undefined' ? undefined : getReviewWordCount(reviewText)

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
          rating: true,
          reviewText: true,
        },
      }),
    ])

    if (watchlistItem && input.confirmRemoveWant) {
      await tx.watchlistItem.deleteMany({
        where: {
          userId,
          movieId,
        },
      })
    }

    const watchedAt =
      input.watchedAt ||
      (input.preserveWatchedAt && existingWatchedMovie?.watchedAt
        ? existingWatchedMovie.watchedAt
        : new Date())

    const watchedMovie = await tx.userMovieWatch.upsert({
      where: {
        userId_movieId: {
          userId,
          movieId,
        },
      },
      update: {
        watchedAt,
        ...(typeof input.rating !== 'undefined' ? { rating: input.rating } : {}),
        ...(typeof reviewText !== 'undefined'
          ? {
              reviewText,
              reviewWordCount,
            }
          : {}),
      },
      create: {
        userId,
        movieId,
        watchedAt,
        rating: input.rating ?? null,
        reviewText: reviewText ?? null,
        reviewWordCount: reviewWordCount ?? 0,
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
      alreadyExisted: Boolean(existingWatchedMovie),
      watchedAt: watchedMovie.watchedAt.toISOString(),
      rating: toPlainRating(watchedMovie.rating),
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

export type WantListPageData = Awaited<ReturnType<typeof getWantListPageData>>

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
    items: items.map((item) => ({
      ...item,
      rating: toPlainRating(item.rating),
    })),
  }
}
