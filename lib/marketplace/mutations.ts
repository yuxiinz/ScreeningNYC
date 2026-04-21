import { prisma } from '@/lib/prisma'
import {
  MARKETPLACE_POST_TYPES,
  normalizeMarketplaceContactSnapshot,
  normalizeMarketplaceDisplayName,
  normalizeMarketplaceSeatInfo,
} from '@/lib/marketplace/shared'
import {
  MarketplaceNotFoundError,
  MarketplaceValidationError,
} from '@/lib/marketplace/errors'
import { getUpcomingShowtimeWhere } from '@/lib/showtime/queries'
import {
  getMarketplaceDisplayName,
  getMarketplacePostWriteData,
  type UpsertMarketplacePostInput,
  type UpsertMarketplacePostsInput,
} from '@/lib/marketplace/selects'
import { getMarketplaceUser } from '@/lib/marketplace/queries'
import { notifyMatchingMarketplacePosts } from '@/lib/marketplace/notifications'

async function getMarketplaceShowtimes(
  showtimeIds: number[],
  now: Date = new Date()
) {
  const showtimes = await prisma.showtime.findMany({
    where: {
      id: {
        in: showtimeIds,
      },
      ...getUpcomingShowtimeWhere(now),
    },
    select: {
      id: true,
      movieId: true,
      startTime: true,
      movie: {
        select: {
          id: true,
          title: true,
        },
      },
      theater: {
        select: {
          name: true,
        },
      },
    },
  })
  const showtimeById = new Map(showtimes.map((showtime) => [showtime.id, showtime]))
  const orderedShowtimes = showtimeIds
    .map((showtimeId) => showtimeById.get(showtimeId))
    .filter(
      (showtime): showtime is NonNullable<typeof showtime> => Boolean(showtime)
    )

  if (orderedShowtimes.length !== showtimeIds.length) {
    throw new MarketplaceNotFoundError(
      showtimeIds.length === 1
        ? 'This showtime is not available for marketplace posts.'
        : 'One or more selected showtimes are not available for marketplace posts.'
    )
  }

  return orderedShowtimes
}

function validateMarketplacePostFields(input: {
  type: string
  quantity: number
  priceCents?: number | null
  contactSnapshot: string
}) {
  if (!MARKETPLACE_POST_TYPES.includes(input.type as never)) {
    throw new MarketplaceValidationError('type must be BUY or SELL.')
  }

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new MarketplaceValidationError('quantity must be a positive integer.')
  }

  if (!normalizeMarketplaceContactSnapshot(input.contactSnapshot)) {
    throw new MarketplaceValidationError('Contact info is required.')
  }

  if (input.type === 'SELL') {
    if (
      !Number.isInteger(input.priceCents) ||
      (input.priceCents as number) < 0
    ) {
      throw new MarketplaceValidationError(
        'priceCents must be a non-negative integer for SELL posts.'
      )
    }
  }
}

function validateMarketplacePostInput(input: UpsertMarketplacePostInput) {
  if (!Number.isInteger(input.showtimeId) || input.showtimeId <= 0) {
    throw new MarketplaceValidationError('showtimeId must be a positive integer.')
  }

  validateMarketplacePostFields(input)
}

function validateMarketplacePostsInput(input: UpsertMarketplacePostsInput) {
  if (input.showtimeIds.length === 0) {
    throw new MarketplaceValidationError(
      'showtimeIds must contain at least one positive integer.'
    )
  }

  if (
    input.showtimeIds.some(
      (showtimeId) => !Number.isInteger(showtimeId) || showtimeId <= 0
    )
  ) {
    throw new MarketplaceValidationError(
      'showtimeIds must contain only positive integers.'
    )
  }

  validateMarketplacePostFields(input)
}

export async function upsertMarketplacePosts(
  userId: string,
  input: UpsertMarketplacePostsInput
) {
  validateMarketplacePostsInput(input)

  const showtimeIds = [...new Set(input.showtimeIds)]
  const now = new Date()
  const [user, showtimes] = await Promise.all([
    getMarketplaceUser(userId),
    getMarketplaceShowtimes(showtimeIds, now),
  ])
  const normalizedDisplayName = normalizeMarketplaceDisplayName(input.displayName)

  if (!normalizeMarketplaceDisplayName(user.name) && !normalizedDisplayName) {
    throw new MarketplaceValidationError('Display name is required.')
  }

  const normalizedContactSnapshot = normalizeMarketplaceContactSnapshot(
    input.contactSnapshot
  )
  const normalizedSeatInfo = normalizeMarketplaceSeatInfo(input.seatInfo)
  const postWriteData = getMarketplacePostWriteData(
    input,
    normalizedSeatInfo,
    normalizedContactSnapshot
  )
  const movieId = showtimes[0]?.movieId

  if (!movieId) {
    throw new MarketplaceNotFoundError(
      'One or more selected showtimes are not available for marketplace posts.'
    )
  }

  if (showtimes.some((showtime) => showtime.movieId !== movieId)) {
    throw new MarketplaceValidationError(
      'All showtimeIds must belong to the same movie.'
    )
  }

  const existingPosts = await prisma.marketplacePost.findMany({
    where: {
      userId,
      type: input.type,
      showtimeId: {
        in: showtimeIds,
      },
    },
    select: {
      id: true,
      showtimeId: true,
      status: true,
    },
  })
  const existingByShowtimeId = new Map(
    existingPosts.map((post) => [post.showtimeId, post])
  )

  const posts = await prisma.$transaction(async (tx) => {
    if (!normalizeMarketplaceDisplayName(user.name) && normalizedDisplayName) {
      await tx.user.update({
        where: { id: userId },
        data: {
          name: normalizedDisplayName,
        },
      })
    }

    const nextPosts = []

    for (const showtimeId of showtimeIds) {
      nextPosts.push(
        await tx.marketplacePost.upsert({
          where: {
            userId_showtimeId_type: {
              userId,
              showtimeId,
              type: input.type,
            },
          },
          update: {
            status: 'ACTIVE',
            ...postWriteData,
            closedAt: null,
          },
          create: {
            userId,
            showtimeId,
            type: input.type,
            status: 'ACTIVE',
            ...postWriteData,
          },
          select: {
            id: true,
            showtimeId: true,
            type: true,
            status: true,
            quantity: true,
            priceCents: true,
            seatInfo: true,
            updatedAt: true,
          },
        })
      )
    }

    return nextPosts
  })

  const results = []
  let notifiedMatchCount = 0

  for (const post of posts) {
    const existing = existingByShowtimeId.get(post.showtimeId)
    const shouldNotify = !existing || existing.status !== 'ACTIVE'
    const postNotifiedMatchCount = shouldNotify
      ? await notifyMatchingMarketplacePosts(post.id)
      : 0

    results.push({
      post,
      reusedExisting: Boolean(existing),
      notifiedMatchCount: postNotifiedMatchCount,
    })
    notifiedMatchCount += postNotifiedMatchCount
  }

  return {
    posts: results,
    reusedExistingCount: results.filter((result) => result.reusedExisting).length,
    notifiedMatchCount,
    movieId,
  }
}

export async function upsertMarketplacePost(
  userId: string,
  input: UpsertMarketplacePostInput
) {
  validateMarketplacePostInput(input)

  const result = await upsertMarketplacePosts(userId, {
    type: input.type,
    showtimeIds: [input.showtimeId],
    quantity: input.quantity,
    priceCents: input.priceCents,
    seatInfo: input.seatInfo,
    contactSnapshot: input.contactSnapshot,
    displayName: input.displayName,
  })
  const [firstResult] = result.posts

  if (!firstResult) {
    throw new MarketplaceNotFoundError(
      'This showtime is not available for marketplace posts.'
    )
  }

  return {
    post: firstResult.post,
    reusedExisting: firstResult.reusedExisting,
    notifiedMatchCount: firstResult.notifiedMatchCount,
    movieId: result.movieId,
  }
}

async function updateMarketplacePostStatus(
  userId: string,
  postId: number,
  status: 'COMPLETED' | 'CANCELED'
) {
  const existing = await prisma.marketplacePost.findFirst({
    where: {
      id: postId,
      userId,
    },
    select: {
      id: true,
      type: true,
      status: true,
      showtimeId: true,
      quantity: true,
      priceCents: true,
      seatInfo: true,
      closedAt: true,
      updatedAt: true,
      showtime: {
        select: {
          movieId: true,
        },
      },
    },
  })

  if (!existing) {
    throw new MarketplaceNotFoundError('Marketplace post not found.')
  }

  const closedAt = existing.closedAt || new Date()
  const post = await prisma.marketplacePost.update({
    where: {
      id: postId,
    },
    data: {
      status,
      closedAt,
    },
    select: {
      id: true,
      type: true,
      status: true,
      showtimeId: true,
      quantity: true,
      priceCents: true,
      seatInfo: true,
      updatedAt: true,
      closedAt: true,
    },
  })

  return {
    post,
    movieId: existing.showtime.movieId,
  }
}

export async function completeMarketplacePost(userId: string, postId: number) {
  return updateMarketplacePostStatus(userId, postId, 'COMPLETED')
}

export async function cancelMarketplacePost(userId: string, postId: number) {
  return updateMarketplacePostStatus(userId, postId, 'CANCELED')
}

export async function getMarketplacePostContact(userId: string, postId: number) {
  const now = new Date()
  const post = await prisma.marketplacePost.findFirst({
    where: {
      id: postId,
      status: 'ACTIVE',
      showtime: {
        is: getUpcomingShowtimeWhere(now),
      },
    },
    select: {
      id: true,
      userId: true,
      type: true,
      showtimeId: true,
      contactSnapshot: true,
      user: {
        select: {
          name: true,
        },
      },
    },
  })

  if (!post) {
    throw new MarketplaceNotFoundError('Marketplace post not found.')
  }

  return {
    post: {
      id: post.id,
      type: post.type,
      showtimeId: post.showtimeId,
      user: {
        displayName: getMarketplaceDisplayName(post.user.name),
      },
    },
    contact: post.contactSnapshot,
    isOwnPost: post.userId === userId,
  }
}
