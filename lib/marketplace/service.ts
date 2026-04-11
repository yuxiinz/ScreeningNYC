import { sendEmail } from '@/lib/auth/email'
import { getReminderBaseUrl } from '@/lib/auth/env'
import { prisma } from '@/lib/prisma'
import {
  MARKETPLACE_POST_TYPES,
  getOppositeMarketplacePostType,
  normalizeMarketplaceContactSnapshot,
  normalizeMarketplaceDisplayName,
  normalizeMarketplaceSeatInfo,
  type MarketplacePostTypeValue,
} from '@/lib/marketplace/shared'
import {
  MarketplaceNotFoundError,
  MarketplaceValidationError,
} from '@/lib/marketplace/errors'
import { getUpcomingShowtimeWhere } from '@/lib/showtime/queries'
import {
  formatDateKeyInAppTimezone,
  formatTimeInAppTimezone,
  getDateKeyInAppTimezone,
} from '@/lib/timezone'

const MARKETPLACE_MOVIE_SELECT = {
  id: true,
  title: true,
  posterUrl: true,
  directorText: true,
  releaseDate: true,
  runtimeMinutes: true,
} as const

const MARKETPLACE_SHOWTIME_SELECT = {
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
} as const

const MARKETPLACE_MY_POST_SHOWTIME_SELECT = {
  ...MARKETPLACE_SHOWTIME_SELECT,
  movie: {
    select: {
      id: true,
      title: true,
      posterUrl: true,
    },
  },
} as const

function getMarketplacePostSelect() {
  return {
    id: true,
    userId: true,
    type: true,
    quantity: true,
    priceCents: true,
    seatInfo: true,
    updatedAt: true,
    user: {
      select: {
        name: true,
        image: true,
      },
    },
  } as const
}

export type MarketplaceHomeMovieCard = {
  movie: MarketplaceMovieSummary
  activeBuyCount: number
  activeSellCount: number
  activeShowtimeCount: number
  latestActivityAt: Date
}

export type MarketplacePostPublicCard = {
  id: number
  type: MarketplacePostTypeValue
  quantity: number
  priceCents: number | null
  seatInfo: string | null
  updatedAt: Date
  user: {
    displayName: string
    imageUrl: string | null
  }
  isOwnPost: boolean
  canContact: boolean
}

type MarketplaceMovieSummary = {
  id: number
  title: string
  posterUrl: string | null
  directorText: string | null
  releaseDate: Date | null
  runtimeMinutes: number | null
}

type MarketplaceMoviePreview = Pick<
  MarketplaceMovieSummary,
  'id' | 'title' | 'posterUrl' | 'directorText'
>

type MarketplaceShowtimeSummary = {
  id: number
  startTime: Date
  runtimeMinutes: number | null
  ticketUrl: string | null
  shownTitle: string | null
  theater: {
    name: string
  }
  format: {
    name: string
  } | null
}

type MarketplaceExistingPost = {
  id: number
  type: MarketplacePostTypeValue
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELED'
  quantity: number
  priceCents: number | null
  seatInfo: string | null
  contactSnapshot: string
}

type MarketplaceMyPostShowtime = MarketplaceShowtimeSummary & {
  movie: Pick<MarketplaceMovieSummary, 'id' | 'title' | 'posterUrl'>
}

export type MarketplaceMoviePageData = {
  movie: MarketplaceMovieSummary
  sections: Array<{
    showtime: MarketplaceShowtimeSummary
    activeBuyCount: number
    activeSellCount: number
    buys: MarketplacePostPublicCard[]
    sells: MarketplacePostPublicCard[]
  }>
}

export type MarketplaceNewPageData = {
  user: {
    displayName: string
    requiresDisplayName: boolean
  }
  selectedType: MarketplacePostTypeValue | null
  selectedMovie: MarketplaceMoviePreview | null
  availableShowtimes: MarketplaceShowtimeSummary[]
  selectedShowtimeIds: number[]
  existingPost: MarketplaceExistingPost | null
}

export type MyMarketplacePostRow = {
  id: number
  type: MarketplacePostTypeValue
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELED'
  quantity: number
  priceCents: number | null
  seatInfo: string | null
  updatedAt: Date
  closedAt: Date | null
  showtime: MarketplaceMyPostShowtime
}

type MarketplacePostDraftInput = {
  type: MarketplacePostTypeValue
  quantity: number
  priceCents?: number | null
  seatInfo?: string | null
  contactSnapshot: string
  displayName?: string | null
}

export type UpsertMarketplacePostInput = MarketplacePostDraftInput & {
  showtimeId: number
}

export type UpsertMarketplacePostsInput = MarketplacePostDraftInput & {
  showtimeIds: number[]
}

function getMarketplaceDisplayName(name?: string | null) {
  return normalizeMarketplaceDisplayName(name) || 'SCREENING NYC MEMBER'
}

function buildMarketplacePostPublicCard(
  post: {
    id: number
    userId: string
    type: MarketplacePostTypeValue
    quantity: number
    priceCents: number | null
    seatInfo: string | null
    updatedAt: Date
    user: {
      name: string | null
      image: string | null
    }
  },
  currentUserId: string | null
): MarketplacePostPublicCard {
  const isOwnPost = Boolean(currentUserId && post.userId === currentUserId)

  return {
    id: post.id,
    type: post.type,
    quantity: post.quantity,
    priceCents: post.priceCents,
    seatInfo: post.seatInfo,
    updatedAt: post.updatedAt,
    user: {
      displayName: getMarketplaceDisplayName(post.user.name),
      imageUrl: post.user.image,
    },
    isOwnPost,
    canContact: Boolean(currentUserId) && !isOwnPost,
  }
}

function getMarketplaceShowtimeLabel(startTime: Date) {
  const dateLabel = formatDateKeyInAppTimezone(getDateKeyInAppTimezone(startTime))
  return `${dateLabel} at ${formatTimeInAppTimezone(startTime)}`
}

function getMarketplacePostWriteData(
  input: Pick<
    MarketplacePostDraftInput,
    'type' | 'quantity' | 'priceCents'
  >,
  normalizedSeatInfo: string | null | undefined,
  normalizedContactSnapshot: string
) {
  return {
    quantity: input.quantity,
    priceCents: input.type === 'SELL' ? input.priceCents ?? 0 : null,
    seatInfo: input.type === 'SELL' ? normalizedSeatInfo : null,
    contactSnapshot: normalizedContactSnapshot,
  }
}

async function getMarketplaceUser(userId: string) {
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
      (
        showtime
      ): showtime is NonNullable<typeof showtime> => Boolean(showtime)
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
  type: MarketplacePostTypeValue
  quantity: number
  priceCents?: number | null
  contactSnapshot: string
}) {
  if (!MARKETPLACE_POST_TYPES.includes(input.type)) {
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

async function notifyMatchingMarketplacePosts(triggerPostId: number) {
  const triggerPost = await prisma.marketplacePost.findUnique({
    where: {
      id: triggerPostId,
    },
    select: {
      id: true,
      userId: true,
      type: true,
      status: true,
      quantity: true,
      priceCents: true,
      showtimeId: true,
      user: {
        select: {
          name: true,
        },
      },
      showtime: {
        select: {
          id: true,
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
      },
    },
  })

  if (!triggerPost || triggerPost.status !== 'ACTIVE') {
    return 0
  }

  const recipientType = getOppositeMarketplacePostType(triggerPost.type)
  const recipients = await prisma.marketplacePost.findMany({
    where: {
      showtimeId: triggerPost.showtimeId,
      status: 'ACTIVE',
      type: recipientType,
      userId: {
        not: triggerPost.userId,
      },
    },
    select: {
      id: true,
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  })

  if (recipients.length === 0) {
    return 0
  }

  const existingNotifications = await prisma.marketplaceMatchNotification.findMany({
    where: {
      triggerPostId,
      recipientPostId: {
        in: recipients.map((recipient) => recipient.id),
      },
    },
    select: {
      recipientPostId: true,
    },
  })
  const existingRecipientIds = new Set(
    existingNotifications.map((notification) => notification.recipientPostId)
  )

  const baseUrl = getReminderBaseUrl()
  const marketplaceUrl = `${baseUrl}/market/films/${triggerPost.showtime.movie.id}`
  const triggerLabel =
    triggerPost.type === 'SELL'
      ? `A new seller posted ${triggerPost.quantity} ticket${triggerPost.quantity === 1 ? '' : 's'}`
      : `A new buyer is looking for ${triggerPost.quantity} ticket${triggerPost.quantity === 1 ? '' : 's'}`
  const priceLabel =
    triggerPost.type === 'SELL' && typeof triggerPost.priceCents === 'number'
      ? ` for $${(triggerPost.priceCents / 100).toFixed(2)}`
      : ''
  const showtimeLabel = getMarketplaceShowtimeLabel(triggerPost.showtime.startTime)

  let notifiedMatchCount = 0

  for (const recipient of recipients) {
    if (existingRecipientIds.has(recipient.id)) {
      continue
    }

    try {
      const messageId = await sendEmail({
        to: recipient.user.email,
        subject: `New ${triggerPost.type} match for ${triggerPost.showtime.movie.title}`,
        html: `
          <div style="font-family: Helvetica Neue, Arial, sans-serif; color: #111;">
            <p>Hi ${getMarketplaceDisplayName(recipient.user.name)},</p>
            <p>${triggerLabel}${priceLabel} for <strong>${triggerPost.showtime.movie.title}</strong>.</p>
            <p>${showtimeLabel} at ${triggerPost.showtime.theater.name}.</p>
            <p>
              <a href="${marketplaceUrl}" style="display: inline-block; padding: 12px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">
                Open marketplace
              </a>
            </p>
            <p>You still need to contact the other user directly inside Screening NYC to finish the trade.</p>
          </div>
        `,
        text: [
          `Hi ${getMarketplaceDisplayName(recipient.user.name)},`,
          '',
          `${triggerLabel}${priceLabel} for ${triggerPost.showtime.movie.title}.`,
          `${showtimeLabel} at ${triggerPost.showtime.theater.name}.`,
          '',
          marketplaceUrl,
          '',
          'You still need to contact the other user directly inside Screening NYC to finish the trade.',
        ].join('\n'),
      })

      await prisma.marketplaceMatchNotification.create({
        data: {
          triggerPostId,
          recipientPostId: recipient.id,
          sentToEmail: recipient.user.email,
          resendMessageId: messageId || undefined,
        },
      })

      notifiedMatchCount += 1
    } catch (error) {
      console.error('[marketplace][notify-match]', error, {
        recipientPostId: recipient.id,
        triggerPostId,
      })
    }
  }

  return notifiedMatchCount
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
          select: getMarketplacePostSelect(),
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
