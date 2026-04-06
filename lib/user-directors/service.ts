import { prisma } from '@/lib/prisma'
import { getUpcomingShowtimeWhere } from '@/lib/showtime/queries'

export type DirectorCollectionState = {
  inWant: boolean
}

function getUniquePersonIds(personIds: number[]) {
  return [...new Set(personIds.filter((personId) => Number.isInteger(personId) && personId > 0))]
}

async function getDirectorUpcomingMovieIds(personId: number, now: Date = new Date()) {
  const movies = await prisma.movie.findMany({
    where: {
      peopleLinks: {
        some: {
          personId,
          kind: 'DIRECTOR',
        },
      },
      showtimes: {
        some: getUpcomingShowtimeWhere(now),
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  })

  return movies.map((movie) => movie.id)
}

export async function getDirectorStatesForUser(
  userId: string | null,
  personIds: number[]
) {
  const uniquePersonIds = getUniquePersonIds(personIds)
  const states = new Map<number, DirectorCollectionState>()

  uniquePersonIds.forEach((personId) => {
    states.set(personId, {
      inWant: false,
    })
  })

  if (!userId || uniquePersonIds.length === 0) {
    return states
  }

  const items = await prisma.directorWatchlistItem.findMany({
    where: {
      userId,
      personId: {
        in: uniquePersonIds,
      },
    },
    select: {
      personId: true,
    },
  })

  items.forEach(({ personId }) => {
    states.set(personId, {
      inWant: true,
    })
  })

  return states
}

export async function addDirectorWant(userId: string, personId: number) {
  const existing = await prisma.directorWatchlistItem.findUnique({
    where: {
      userId_personId: {
        userId,
        personId,
      },
    },
    select: {
      id: true,
    },
  })

  if (existing) {
    return {
      personId,
      inWant: true,
    }
  }

  const [upcomingMovieIds, user] = await Promise.all([
    getDirectorUpcomingMovieIds(personId),
    prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        email: true,
      },
    }),
  ])

  const item = await prisma.directorWatchlistItem.create({
    data: {
      userId,
      personId,
      addedWhileOnScreen: upcomingMovieIds.length > 0,
    },
    select: {
      id: true,
    },
  })

  if (upcomingMovieIds.length > 0) {
    await prisma.directorWatchlistNotificationDelivery.createMany({
      data: upcomingMovieIds.map((movieId) => ({
        directorWatchlistItemId: item.id,
        movieId,
        sentToEmail: user?.email || '',
      })),
      skipDuplicates: true,
    })
  }

  return {
    personId,
    inWant: true,
  }
}

export async function removeDirectorWant(userId: string, personId: number) {
  await prisma.directorWatchlistItem.deleteMany({
    where: {
      userId,
      personId,
    },
  })

  return {
    personId,
    inWant: false,
  }
}

export async function getWantDirectorListPageData(userId: string) {
  const now = new Date()
  const items = await prisma.directorWatchlistItem.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      createdAt: true,
      person: {
        select: {
          id: true,
          name: true,
          photoUrl: true,
        },
      },
    },
  })

  const personIds = items.map((item) => item.person.id)

  const movies = personIds.length
    ? await prisma.movie.findMany({
        where: {
          peopleLinks: {
            some: {
              kind: 'DIRECTOR',
              personId: {
                in: personIds,
              },
            },
          },
          showtimes: {
            some: getUpcomingShowtimeWhere(now),
          },
        },
        select: {
          id: true,
          title: true,
          peopleLinks: {
            where: {
              kind: 'DIRECTOR',
              personId: {
                in: personIds,
              },
            },
            select: {
              personId: true,
            },
          },
          showtimes: {
            where: getUpcomingShowtimeWhere(now),
            orderBy: {
              startTime: 'asc',
            },
            take: 1,
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
        orderBy: {
          updatedAt: 'desc',
        },
      })
    : []

  const moviesByPersonId = new Map<
    number,
    Array<{
      id: number
      title: string
      showtimes: Array<{
        id: number
        startTime: Date
        theater: {
          name: string
        }
      }>
    }>
  >()

  movies.forEach((movie) => {
    movie.peopleLinks.forEach((link) => {
      const existing = moviesByPersonId.get(link.personId) || []
      existing.push({
        id: movie.id,
        title: movie.title,
        showtimes: movie.showtimes,
      })
      moviesByPersonId.set(link.personId, existing)
    })
  })

  const normalizedItems = items.map((item) => ({
    createdAt: item.createdAt,
    person: item.person,
    onScreenMovies: moviesByPersonId.get(item.person.id) || [],
  }))

  return {
    totalCount: normalizedItems.length,
    onScreenNowCount: normalizedItems.filter((item) => item.onScreenMovies.length > 0).length,
    items: normalizedItems,
  }
}

export type WantDirectorListPageData = Awaited<
  ReturnType<typeof getWantDirectorListPageData>
>
