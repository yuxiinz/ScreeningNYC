import { cacheLife, cacheTag } from 'next/cache'
import { DateTime } from 'luxon'

import { prisma } from '@/lib/prisma'
import { APP_TIMEZONE, getDateKeyInAppTimezone } from '@/lib/timezone'

export const PUBLIC_CACHE_TAGS = {
  home: 'home-public',
  theaterDirectory: 'theater-directory',
  date: 'date-public',
  movieDetail: 'movie-detail-public',
  todaySensitive: 'today-sensitive',
} as const

const TODAY_SCHEDULE_CACHE = {
  stale: 300,
  revalidate: 600,
  expire: 3600,
} as const

const DAILY_SCHEDULE_CACHE = {
  stale: 300,
  revalidate: 86400,
  expire: 604800,
} as const

type CachedDateQueryInput = {
  selectedTheaterSlugs: string[]
  targetDate: string
  todayKey: string
}

type CachedHomeQueryInput = {
  selectedTheaterSlugs: string[]
  todayKey: string
  page: number
  pageSize: number
}

export async function getCachedTheaterDirectory() {
  'use cache'

  cacheLife('max')
  cacheTag(PUBLIC_CACHE_TAGS.theaterDirectory)

  return prisma.theater.findMany({
    orderBy: {
      name: 'asc',
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  })
}

export async function getCachedHomeMovies({
  selectedTheaterSlugs,
  todayKey,
  page,
  pageSize,
}: CachedHomeQueryInput) {
  'use cache'

  cacheLife(TODAY_SCHEDULE_CACHE)
  cacheTag(PUBLIC_CACHE_TAGS.home, PUBLIC_CACHE_TAGS.todaySensitive, todayKey)

  const now = new Date()
  const upcomingShowtimeWhere = {
    startTime: {
      gt: now,
    },
    status: 'SCHEDULED' as const,
    ...(selectedTheaterSlugs.length > 0
      ? {
          theater: {
            slug: {
              in: selectedTheaterSlugs,
            },
          },
        }
      : {}),
  }
  const movieWhere = {
    showtimes: {
      some: upcomingShowtimeWhere,
    },
  }
  const totalCount = await prisma.movie.count({
    where: movieWhere,
  })
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, totalPages)
  const skip = (safePage - 1) * pageSize

  const orderedMovieGroups = await prisma.showtime.groupBy({
    by: ['movieId'],
    where: upcomingShowtimeWhere,
    _min: {
      startTime: true,
    },
    orderBy: [
      {
        _min: {
          startTime: 'asc',
        },
      },
      {
        movieId: 'asc',
      },
    ],
    skip,
    take: pageSize,
  })
  const movieIds = orderedMovieGroups.map((group) => group.movieId)

  const movieRows =
    movieIds.length === 0
      ? []
      : await prisma.movie.findMany({
          where: {
            id: {
              in: movieIds,
            },
          },
          select: {
            id: true,
            title: true,
            releaseDate: true,
            posterUrl: true,
            directorText: true,
            imdbUrl: true,
            doubanUrl: true,
            letterboxdUrl: true,
          },
        })
  const movieById = new Map(movieRows.map((movie) => [movie.id, movie]))
  const movies = movieIds
    .map((movieId) => movieById.get(movieId))
    .filter((movie): movie is (typeof movieRows)[number] => Boolean(movie))

  return {
    totalCount,
    totalPages,
    safePage,
    movies,
  }
}

export async function getCachedDateShowtimes({
  selectedTheaterSlugs,
  targetDate,
  todayKey,
}: CachedDateQueryInput) {
  'use cache'

  const isToday = targetDate === todayKey

  cacheLife(isToday ? TODAY_SCHEDULE_CACHE : DAILY_SCHEDULE_CACHE)
  cacheTag(PUBLIC_CACHE_TAGS.date, `date:${targetDate}`)

  if (isToday) {
    cacheTag(PUBLIC_CACHE_TAGS.todaySensitive, todayKey)
  }

  const nowNy = DateTime.now().setZone(APP_TIMEZONE)
  const startOfDayNy = DateTime.fromISO(targetDate, {
    zone: APP_TIMEZONE,
  }).startOf('day')
  const endOfDayNy = DateTime.fromISO(targetDate, {
    zone: APP_TIMEZONE,
  }).endOf('day')
  const queryStartNy = isToday ? nowNy : startOfDayNy

  return prisma.showtime.findMany({
    where: {
      startTime: {
        gte: queryStartNy.toUTC().toJSDate(),
        lte: endOfDayNy.toUTC().toJSDate(),
      },
      status: 'SCHEDULED',
      ...(selectedTheaterSlugs.length > 0
        ? {
            theater: {
              slug: {
                in: selectedTheaterSlugs,
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      movieId: true,
      startTime: true,
      runtimeMinutes: true,
      ticketUrl: true,
      shownTitle: true,
      movie: {
        select: {
          id: true,
          title: true,
          posterUrl: true,
          directorText: true,
          runtimeMinutes: true,
          imdbUrl: true,
          doubanUrl: true,
          letterboxdUrl: true,
        },
      },
      theater: {
        select: {
          name: true,
        },
      },
      format: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      startTime: 'asc',
    },
  })
}

export async function getMapTheaters() {
  const rawTheaters = await prisma.theater.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      latitude: true,
      longitude: true,
      address: true,
    },
  })

  return rawTheaters
    .filter(
      (
        theater
      ): theater is typeof theater & {
        latitude: NonNullable<typeof theater.latitude>
        longitude: NonNullable<typeof theater.longitude>
      } => theater.latitude !== null && theater.longitude !== null
    )
    .map((theater) => ({
      id: theater.id,
      name: theater.name,
      slug: theater.slug,
      latitude: Number(theater.latitude),
      longitude: Number(theater.longitude),
      address: theater.address,
    }))
}

export async function getCachedMovieDetail(movieId: number, todayKey: string) {
  'use cache'

  const movie = await prisma.movie.findUnique({
    where: { id: movieId },
    select: {
      id: true,
      tmdbId: true,
      title: true,
      posterUrl: true,
      directorText: true,
      releaseDate: true,
      runtimeMinutes: true,
      overview: true,
      imdbUrl: true,
      doubanUrl: true,
      letterboxdUrl: true,
      showtimes: {
        select: {
          id: true,
          startTime: true,
          runtimeMinutes: true,
          ticketUrl: true,
          shownTitle: true,
          theater: {
            select: {
              name: true,
            },
          },
          format: {
            select: {
              name: true,
            },
          },
        },
        where: {
          startTime: {
            gt: new Date(),
          },
          status: 'SCHEDULED',
        },
        orderBy: { startTime: 'asc' },
      },
    },
  })

  const hasTodayShowtime = movie?.showtimes.some(
    (showtime) => getDateKeyInAppTimezone(showtime.startTime) === todayKey
  )

  cacheLife(hasTodayShowtime ? TODAY_SCHEDULE_CACHE : DAILY_SCHEDULE_CACHE)
  cacheTag(
    PUBLIC_CACHE_TAGS.movieDetail,
    `${PUBLIC_CACHE_TAGS.movieDetail}:${movieId}`
  )

  if (hasTodayShowtime) {
    cacheTag(PUBLIC_CACHE_TAGS.todaySensitive, todayKey)
  }

  return movie
}

export async function getMovieDirectorPeople(movieId: number) {
  return prisma.moviePerson.findMany({
    where: {
      movieId,
      kind: 'DIRECTOR',
    },
    select: {
      billingOrder: true,
      person: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      billingOrder: 'asc',
    },
  })
}
