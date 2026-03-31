import { prisma } from '@/lib/prisma'

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
}

export async function markWatched(
  userId: string,
  movieId: number,
  input: MarkWatchedInput = {}
) {
  const watchedAt = new Date()

  return prisma.$transaction(async (tx) => {
    const watchlistItem = await tx.watchlistItem.findUnique({
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

    if (watchlistItem && !input.confirmRemoveWant) {
      throw new WantRemovalConfirmationRequiredError()
    }

    if (watchlistItem) {
      await tx.watchlistItem.delete({
        where: {
          id: watchlistItem.id,
        },
      })
    }

    const watchedMovie = await tx.userMovieWatch.upsert({
      where: {
        userId_movieId: {
          userId,
          movieId,
        },
      },
      update: {
        watchedAt,
      },
      create: {
        userId,
        movieId,
        watchedAt,
      },
      select: {
        watchedAt: true,
      },
    })

    return {
      movieId,
      inWatched: true,
      removedFromWant: Boolean(watchlistItem),
      watchedAt: watchedMovie.watchedAt.toISOString(),
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
