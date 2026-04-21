import { prisma } from '@/lib/prisma'
import { normalizeMarketplaceDisplayName, type MarketplacePostTypeValue } from '@/lib/marketplace/shared'
import { MarketplaceNotFoundError } from '@/lib/marketplace/errors'
import { getUpcomingShowtimeWhere } from '@/lib/showtime/queries'
import {
  MARKETPLACE_MOVIE_SELECT,
  MARKETPLACE_SHOWTIME_SELECT,
  MARKETPLACE_MY_POST_SHOWTIME_SELECT,
  MARKETPLACE_POST_SELECT,
  buildMarketplacePostPublicCard,
  type MarketplaceHomeMovieCard,
  type MarketplaceMoviePageData,
  type MarketplaceNewPageData,
  type MyMarketplacePostRow,
} from '@/lib/marketplace/selects'

export async function getMarketplaceUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
    },
  })

  if (!user) {
    throw new MarketplaceNotFoundError('User account not found.')
  }

  return user
}

export async function getMarketplaceHomePageData() {
  const now = new Date()
  const posts = await prisma.marketplacePost.findMany({
    where: {
      status: 'ACTIVE',
      showtime: {
        is: getUpcomingShowtimeWhere(now),
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    select: {
      type: true,
      updatedAt: true,
      showtime: {
        select: {
          id: true,
          movie: {
            select: MARKETPLACE_MOVIE_SELECT,
          },
        },
      },
    },
  })

  const groupedByMovie = new Map<
    number,
    MarketplaceHomeMovieCard & { showtimeIds: Set<number> }
  >()

  for (const post of posts) {
    const movieId = post.showtime.movie.id
    const existing = groupedByMovie.get(movieId)

    if (existing) {
      if (post.type === 'BUY') {
        existing.activeBuyCount += 1
      } else {
        existing.activeSellCount += 1
      }

      existing.showtimeIds.add(post.showtime.id)

      if (post.updatedAt > existing.latestActivityAt) {
        existing.latestActivityAt = post.updatedAt
      }

      continue
    }

    groupedByMovie.set(movieId, {
      movie: post.showtime.movie,
      activeBuyCount: post.type === 'BUY' ? 1 : 0,
      activeSellCount: post.type === 'SELL' ? 1 : 0,
      activeShowtimeCount: 1,
      latestActivityAt: post.updatedAt,
      showtimeIds: new Set([post.showtime.id]),
    })
  }

  return [...groupedByMovie.values()]
    .map(({ showtimeIds, ...item }) => ({
      ...item,
      activeShowtimeCount: showtimeIds.size,
    }))
    .sort(
      (left, right) =>
        right.latestActivityAt.getTime() - left.latestActivityAt.getTime()
    )
}

export async function getMarketplaceMoviePageData(
  movieId: number,
  currentUserId: string | null
): Promise<MarketplaceMoviePageData | null> {
  const now = new Date()
  const [movie, showtimes] = await Promise.all([
    prisma.movie.findUnique({
      where: { id: movieId },
      select: MARKETPLACE_MOVIE_SELECT,
    }),
    prisma.showtime.findMany({
      where: {
        movieId,
        ...getUpcomingShowtimeWhere(now),
        marketplacePosts: {
          some: {
            status: 'ACTIVE',
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
      select: {
        ...MARKETPLACE_SHOWTIME_SELECT,
        marketplacePosts: {
          where: {
            status: 'ACTIVE',
          },
          orderBy: {
            updatedAt: 'desc',
          },
          select: MARKETPLACE_POST_SELECT,
        },
      },
    }),
  ])

  if (!movie) {
    return null
  }

  return {
    movie,
    sections: showtimes.map((showtime) => {
      const buys = showtime.marketplacePosts
        .filter((post) => post.type === 'BUY')
        .map((post) => buildMarketplacePostPublicCard(post, currentUserId))
      const sells = showtime.marketplacePosts
        .filter((post) => post.type === 'SELL')
        .map((post) => buildMarketplacePostPublicCard(post, currentUserId))

      return {
        showtime: {
          id: showtime.id,
          startTime: showtime.startTime,
          runtimeMinutes: showtime.runtimeMinutes,
          ticketUrl: showtime.ticketUrl,
          shownTitle: showtime.shownTitle,
          theater: showtime.theater,
          format: showtime.format,
        },
        activeBuyCount: buys.length,
        activeSellCount: sells.length,
        buys,
        sells,
      }
    }),
  }
}

export async function getMarketplaceNewPageData(
  userId: string,
  input: {
    type: MarketplacePostTypeValue | null
    movieId: number | null
    showtimeIds: number[]
  }
): Promise<MarketplaceNewPageData> {
  const now = new Date()
  const user = await getMarketplaceUser(userId)
  const displayName = normalizeMarketplaceDisplayName(user.name)

  const selectedMovie = input.movieId
    ? await prisma.movie.findUnique({
        where: {
          id: input.movieId,
        },
        select: {
          id: true,
          title: true,
          posterUrl: true,
          directorText: true,
          showtimes: {
            where: getUpcomingShowtimeWhere(now),
            orderBy: {
              startTime: 'asc',
            },
            select: MARKETPLACE_SHOWTIME_SELECT,
          },
        },
      })
    : null

  const availableShowtimes = selectedMovie?.showtimes || []
  const availableShowtimeIdSet = new Set(
    availableShowtimes.map((showtime) => showtime.id)
  )
  const selectedShowtimeIds = input.showtimeIds.filter((showtimeId) =>
    availableShowtimeIdSet.has(showtimeId)
  )
  const selectedShowtimeId =
    selectedShowtimeIds.length === 1 ? selectedShowtimeIds[0] : null
  const existingPost =
    input.type && selectedShowtimeId
      ? await prisma.marketplacePost.findUnique({
          where: {
            userId_showtimeId_type: {
              userId,
              showtimeId: selectedShowtimeId,
              type: input.type,
            },
          },
          select: {
            id: true,
            type: true,
            status: true,
            quantity: true,
            priceCents: true,
            seatInfo: true,
            contactSnapshot: true,
          },
        })
      : null

  return {
    user: {
      displayName,
      requiresDisplayName: !displayName,
    },
    selectedType: input.type,
    selectedMovie: selectedMovie
      ? {
          id: selectedMovie.id,
          title: selectedMovie.title,
          posterUrl: selectedMovie.posterUrl,
          directorText: selectedMovie.directorText,
        }
      : null,
    availableShowtimes,
    selectedShowtimeIds,
    existingPost,
  }
}

export async function getMyMarketplacePostsPageData(userId: string) {
  const now = new Date()
  const posts = await prisma.marketplacePost.findMany({
    where: {
      userId,
      showtime: {
        is: getUpcomingShowtimeWhere(now),
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    select: {
      id: true,
      type: true,
      status: true,
      quantity: true,
      priceCents: true,
      seatInfo: true,
      updatedAt: true,
      closedAt: true,
      showtime: {
        select: MARKETPLACE_MY_POST_SHOWTIME_SELECT,
      },
    },
  })

  return posts as MyMarketplacePostRow[]
}
