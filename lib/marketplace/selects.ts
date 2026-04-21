import {
  normalizeMarketplaceDisplayName,
  type MarketplacePostTypeValue,
} from '@/lib/marketplace/shared'
import {
  formatDateKeyInAppTimezone,
  formatTimeInAppTimezone,
  getDateKeyInAppTimezone,
} from '@/lib/timezone'

export const MARKETPLACE_MOVIE_SELECT = {
  id: true,
  title: true,
  posterUrl: true,
  directorText: true,
  releaseDate: true,
  runtimeMinutes: true,
} as const

export const MARKETPLACE_SHOWTIME_SELECT = {
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

export const MARKETPLACE_MY_POST_SHOWTIME_SELECT = {
  ...MARKETPLACE_SHOWTIME_SELECT,
  movie: {
    select: {
      id: true,
      title: true,
      posterUrl: true,
    },
  },
} as const

export const MARKETPLACE_POST_SELECT = {
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

export type MarketplaceMovieSummary = {
  id: number
  title: string
  posterUrl: string | null
  directorText: string | null
  releaseDate: Date | null
  runtimeMinutes: number | null
}

export type MarketplaceMoviePreview = Pick<
  MarketplaceMovieSummary,
  'id' | 'title' | 'posterUrl' | 'directorText'
>

export type MarketplaceShowtimeSummary = {
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

export type MarketplaceExistingPost = {
  id: number
  type: MarketplacePostTypeValue
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELED'
  quantity: number
  priceCents: number | null
  seatInfo: string | null
  contactSnapshot: string
}

export type MarketplaceMyPostShowtime = MarketplaceShowtimeSummary & {
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

export type MarketplacePostDraftInput = {
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

export function getMarketplaceDisplayName(name?: string | null) {
  return normalizeMarketplaceDisplayName(name) || 'SCREENING NYC MEMBER'
}

export function buildMarketplacePostPublicCard(
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

export function getMarketplaceShowtimeLabel(startTime: Date) {
  const dateLabel = formatDateKeyInAppTimezone(getDateKeyInAppTimezone(startTime))
  return `${dateLabel} at ${formatTimeInAppTimezone(startTime)}`
}

export function getMarketplacePostWriteData(
  input: Pick<MarketplacePostDraftInput, 'type' | 'quantity' | 'priceCents'>,
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

