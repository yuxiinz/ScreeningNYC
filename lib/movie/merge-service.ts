import type {
  MarketplacePostStatus,
  MarketplacePostType,
  Movie,
  Prisma,
} from '@prisma/client'

import {
  buildDirectorSetSignature,
  collectCanonicalMovieTitleCandidates,
  isLikelyCanonicalDuplicate,
  scoreCanonicalMovieTarget,
} from '@/lib/movie/canonical'
import { prisma } from '@/lib/prisma'
import { normalizeWhitespace } from '@/lib/ingest/core/text'
import { buildFingerprint } from '@/lib/ingest/core/fingerprint'
import { mergeMovieMetadata } from '@/lib/movie/movie-data'

type DbClient = typeof prisma | Prisma.TransactionClient

type MarketplacePostRow = {
  id: number
  userId: string
  type: MarketplacePostType
  status: MarketplacePostStatus
  quantity: number
  priceCents: number | null
  seatInfo: string | null
  contactSnapshot: string
  closedAt: Date | null
  updatedAt: Date
}

export type MergeMovieStats = {
  showtimesMoved: number
  showtimesDeduped: number
  marketplacePostsMoved: number
  marketplacePostsMerged: number
  watchlistItemsMoved: number
  watchlistItemsMerged: number
  watchesMoved: number
  watchesMerged: number
  directorNotificationsMoved: number
  directorNotificationsDeduped: number
}

type MergeCandidateMovie = Pick<
  Movie,
  'id' | 'title' | 'originalTitle' | 'directorText' | 'releaseDate' | 'tmdbId' | 'posterUrl' | 'imdbUrl'
> & {
  _count: {
    showtimes: number
  }
}

function scoreShowtimeMetadata(input: {
  shownTitle?: string | null
  ticketUrl?: string | null
  sourceUrl?: string | null
  sourceShowtimeId?: string | null
}) {
  let score = 0

  if (normalizeWhitespace(input.shownTitle)) {
    score += 5
  }

  if (input.sourceUrl?.includes('/events/event/')) {
    score += 3
  }

  if (input.ticketUrl && !input.ticketUrl.includes('/events/')) {
    score += 2
  }

  if (normalizeWhitespace(input.sourceShowtimeId)) {
    score += 1
  }

  return score
}

function buildMergedShowtimeData(
  existing: {
    shownTitle?: string | null
    ticketUrl?: string | null
    sourceUrl?: string | null
    sourceShowtimeId?: string | null
    runtimeMinutes?: number | null
    endTime?: Date | null
  },
  incoming: {
    shownTitle?: string | null
    ticketUrl?: string | null
    sourceUrl?: string | null
    sourceShowtimeId?: string | null
    runtimeMinutes?: number | null
    endTime?: Date | null
  }
) {
  const preferred =
    scoreShowtimeMetadata(incoming) > scoreShowtimeMetadata(existing)
      ? incoming
      : existing
  const fallback = preferred === existing ? incoming : existing

  return {
    shownTitle:
      normalizeWhitespace(preferred.shownTitle) ||
      normalizeWhitespace(fallback.shownTitle) ||
      null,
    ticketUrl: preferred.ticketUrl || fallback.ticketUrl || null,
    sourceUrl: preferred.sourceUrl || fallback.sourceUrl || null,
    sourceShowtimeId: preferred.sourceShowtimeId || fallback.sourceShowtimeId || null,
    runtimeMinutes: existing.runtimeMinutes || incoming.runtimeMinutes || null,
    endTime: existing.endTime || incoming.endTime || null,
  }
}

function scoreMarketplacePost(row: MarketplacePostRow) {
  let score = 0

  if (row.status === 'ACTIVE') {
    score += 10
  }

  if (!row.closedAt) {
    score += 4
  }

  if (row.priceCents != null) {
    score += 2
  }

  if (row.seatInfo) {
    score += 2
  }

  score += Math.min(row.quantity, 10)
  score += Math.floor(row.updatedAt.getTime() / 1_000_000_000)

  return score
}

function buildMergedMarketplacePostData(
  existing: MarketplacePostRow,
  incoming: MarketplacePostRow
) {
  const preferred =
    scoreMarketplacePost(incoming) > scoreMarketplacePost(existing)
      ? incoming
      : existing
  const fallback = preferred === existing ? incoming : existing

  return {
    status: preferred.status,
    quantity: Math.max(existing.quantity, incoming.quantity),
    priceCents: preferred.priceCents ?? fallback.priceCents,
    seatInfo: preferred.seatInfo || fallback.seatInfo,
    contactSnapshot: preferred.contactSnapshot || fallback.contactSnapshot,
    closedAt: preferred.closedAt || fallback.closedAt,
  }
}

function buildMarketplacePostKey(row: Pick<MarketplacePostRow, 'userId' | 'type'>) {
  return `${row.userId}:${row.type}`
}

function buildCandidateTitleFilters(values: string[]): Prisma.MovieWhereInput[] {
  return values.flatMap((value) => {
    const filters: Prisma.MovieWhereInput[] = [
      {
        title: {
          equals: value,
          mode: 'insensitive',
        },
      },
      {
        originalTitle: {
          equals: value,
          mode: 'insensitive',
        },
      },
    ]

    const shouldUseContains =
      value.length >= 4 || /\s/.test(value) || /[^\x00-\x7F]/.test(value)

    if (shouldUseContains) {
      filters.push(
        {
          title: {
            contains: value,
            mode: 'insensitive',
          },
        },
        {
          originalTitle: {
            contains: value,
            mode: 'insensitive',
          },
        }
      )
    }

    return filters
  })
}

async function getMovieOrThrow(movieId: number, db: DbClient) {
  const movie = await db.movie.findUnique({
    where: { id: movieId },
  })

  if (!movie) {
    throw new Error(`Movie ${movieId} was not found.`)
  }

  return movie
}

export async function getMovieSummary(movieId: number, db: DbClient = prisma) {
  const [
    showtimes,
    watchlistItems,
    watches,
    directorNotifications,
    peopleLinks,
    tagLinks,
    marketplacePosts,
  ] = await Promise.all([
    db.showtime.count({ where: { movieId } }),
    db.watchlistItem.count({ where: { movieId } }),
    db.userMovieWatch.count({ where: { movieId } }),
    db.directorWatchlistNotificationDelivery.count({ where: { movieId } }),
    db.moviePerson.count({ where: { movieId } }),
    db.movieTag.count({ where: { movieId } }),
    db.marketplacePost.count({
      where: {
        showtime: {
          movieId,
        },
      },
    }),
  ])

  return {
    showtimes,
    watchlistItems,
    watches,
    directorNotifications,
    peopleLinks,
    tagLinks,
    marketplacePosts,
  }
}

async function mergeMovieJoinTables(fromId: number, toId: number, db: DbClient) {
  await db.$executeRaw`
    insert into "MoviePerson" ("movieId", "personId", "kind", "billingOrder")
    select ${toId}, "personId", "kind", "billingOrder"
    from "MoviePerson"
    where "movieId" = ${fromId}
    on conflict ("movieId", "personId", "kind") do nothing
  `

  await db.moviePerson.deleteMany({
    where: { movieId: fromId },
  })

  await db.$executeRaw`
    insert into "MovieTag" ("movieId", "tagId")
    select ${toId}, "tagId"
    from "MovieTag"
    where "movieId" = ${fromId}
    on conflict ("movieId", "tagId") do nothing
  `

  await db.movieTag.deleteMany({
    where: { movieId: fromId },
  })
}

async function mergeShowtimeNotificationDeliveries(
  fromShowtimeId: number,
  toShowtimeId: number,
  db: DbClient
) {
  await db.$executeRaw`
    insert into "WatchlistNotificationDelivery" (
      "watchlistItemId",
      "showtimeId",
      "resendMessageId",
      "sentToEmail",
      "sentAt"
    )
    select
      "watchlistItemId",
      ${toShowtimeId},
      "resendMessageId",
      "sentToEmail",
      "sentAt"
    from "WatchlistNotificationDelivery"
    where "showtimeId" = ${fromShowtimeId}
    on conflict ("watchlistItemId", "showtimeId") do nothing
  `

  await db.watchlistNotificationDelivery.deleteMany({
    where: { showtimeId: fromShowtimeId },
  })
}

async function mergeMarketplacePostNotifications(
  fromPostId: number,
  toPostId: number,
  db: DbClient
) {
  await db.$executeRaw`
    insert into "MarketplaceMatchNotification" (
      "triggerPostId",
      "recipientPostId",
      "resendMessageId",
      "sentToEmail",
      "sentAt"
    )
    select
      ${toPostId},
      "recipientPostId",
      "resendMessageId",
      "sentToEmail",
      "sentAt"
    from "MarketplaceMatchNotification"
    where "triggerPostId" = ${fromPostId}
    on conflict ("triggerPostId", "recipientPostId") do nothing
  `

  await db.$executeRaw`
    insert into "MarketplaceMatchNotification" (
      "triggerPostId",
      "recipientPostId",
      "resendMessageId",
      "sentToEmail",
      "sentAt"
    )
    select
      "triggerPostId",
      ${toPostId},
      "resendMessageId",
      "sentToEmail",
      "sentAt"
    from "MarketplaceMatchNotification"
    where "recipientPostId" = ${fromPostId}
    on conflict ("triggerPostId", "recipientPostId") do nothing
  `

  await db.marketplaceMatchNotification.deleteMany({
    where: {
      OR: [
        { triggerPostId: fromPostId },
        { recipientPostId: fromPostId },
      ],
    },
  })
}

async function mergeShowtimeMarketplacePosts(
  fromShowtimeId: number,
  toShowtimeId: number,
  db: DbClient
) {
  const sourcePosts = await db.marketplacePost.findMany({
    where: { showtimeId: fromShowtimeId },
    select: {
      id: true,
      userId: true,
      type: true,
      status: true,
      quantity: true,
      priceCents: true,
      seatInfo: true,
      contactSnapshot: true,
      closedAt: true,
      updatedAt: true,
    },
    orderBy: {
      id: 'asc',
    },
  })

  const targetPosts = await db.marketplacePost.findMany({
    where: { showtimeId: toShowtimeId },
    select: {
      id: true,
      userId: true,
      type: true,
      status: true,
      quantity: true,
      priceCents: true,
      seatInfo: true,
      contactSnapshot: true,
      closedAt: true,
      updatedAt: true,
    },
  })

  const targetByKey = new Map(
    targetPosts.map((post) => [buildMarketplacePostKey(post), post])
  )

  let moved = 0
  let merged = 0

  for (const post of sourcePosts) {
    const key = buildMarketplacePostKey(post)
    const existing = targetByKey.get(key)

    if (existing) {
      await mergeMarketplacePostNotifications(post.id, existing.id, db)
      await db.marketplacePost.update({
        where: { id: existing.id },
        data: buildMergedMarketplacePostData(existing, post),
      })
      await db.marketplacePost.delete({
        where: { id: post.id },
      })
      merged += 1
      continue
    }

    await db.marketplacePost.update({
      where: { id: post.id },
      data: {
        showtimeId: toShowtimeId,
      },
    })

    targetByKey.set(key, {
      ...post,
    })
    moved += 1
  }

  return {
    moved,
    merged,
  }
}

async function mergeShowtimes(
  fromId: number,
  toId: number,
  targetTitle: string,
  db: DbClient
) {
  const sourceShowtimes = await db.showtime.findMany({
    where: { movieId: fromId },
    select: {
      id: true,
      fingerprint: true,
      startTime: true,
      shownTitle: true,
      ticketUrl: true,
      sourceUrl: true,
      sourceShowtimeId: true,
      runtimeMinutes: true,
      endTime: true,
      theater: {
        select: {
          slug: true,
        },
      },
      format: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      id: 'asc',
    },
  })

  const targetShowtimes = await db.showtime.findMany({
    where: { movieId: toId },
    select: {
      id: true,
      fingerprint: true,
      shownTitle: true,
      ticketUrl: true,
      sourceUrl: true,
      sourceShowtimeId: true,
      runtimeMinutes: true,
      endTime: true,
    },
  })

  const targetByFingerprint = new Map<string, (typeof targetShowtimes)[number]>()

  for (const showtime of targetShowtimes) {
    if (showtime.fingerprint) {
      targetByFingerprint.set(showtime.fingerprint, showtime)
    }
  }

  const groupedByFingerprint = new Map<
    string,
    {
      target?: (typeof targetShowtimes)[number]
      sources: Array<
        (typeof sourceShowtimes)[number] & {
          newFingerprint: string
        }
      >
    }
  >()

  for (const showtime of sourceShowtimes) {
    const newFingerprint = buildFingerprint({
      theaterSlug: showtime.theater.slug,
      movieTitle: targetTitle,
      startTimeUtcIso: showtime.startTime.toISOString(),
      formatName: showtime.format?.name || 'Standard',
    })

    const existingGroup = groupedByFingerprint.get(newFingerprint)

    if (existingGroup) {
      existingGroup.sources.push({
        ...showtime,
        newFingerprint,
      })
      continue
    }

    groupedByFingerprint.set(newFingerprint, {
      target: targetByFingerprint.get(newFingerprint),
      sources: [
        {
          ...showtime,
          newFingerprint,
        },
      ],
    })
  }

  let moved = 0
  let deduped = 0
  let marketplacePostsMoved = 0
  let marketplacePostsMerged = 0

  for (const [newFingerprint, group] of groupedByFingerprint.entries()) {
    const sortedSources = [...group.sources].sort((a, b) => {
      const scoreDiff = scoreShowtimeMetadata(b) - scoreShowtimeMetadata(a)
      if (scoreDiff !== 0) {
        return scoreDiff
      }

      return a.id - b.id
    })

    const keeper = group.target || sortedSources[0]
    let mergedShowtimeData = {
      shownTitle: keeper.shownTitle,
      ticketUrl: keeper.ticketUrl,
      sourceUrl: keeper.sourceUrl,
      sourceShowtimeId: keeper.sourceShowtimeId,
      runtimeMinutes: keeper.runtimeMinutes,
      endTime: keeper.endTime,
    }

    for (const source of sortedSources) {
      if (!group.target && source.id === keeper.id) {
        continue
      }

      mergedShowtimeData = buildMergedShowtimeData(mergedShowtimeData, source)

      const marketplaceResult = await mergeShowtimeMarketplacePosts(source.id, keeper.id, db)
      marketplacePostsMoved += marketplaceResult.moved
      marketplacePostsMerged += marketplaceResult.merged

      await mergeShowtimeNotificationDeliveries(source.id, keeper.id, db)
      await db.showtime.delete({ where: { id: source.id } })
      deduped += 1
    }

    if (group.target) {
      await db.showtime.update({
        where: { id: keeper.id },
        data: mergedShowtimeData,
      })
      continue
    }

    await db.showtime.update({
      where: { id: keeper.id },
      data: {
        movieId: toId,
        fingerprint: newFingerprint,
        ...mergedShowtimeData,
      },
    })

    moved += 1
  }

  return {
    moved,
    deduped,
    marketplacePostsMoved,
    marketplacePostsMerged,
  }
}

async function mergeWatchlistItems(fromId: number, toId: number, db: DbClient) {
  const sourceItems = await db.watchlistItem.findMany({
    where: { movieId: fromId },
    select: {
      id: true,
      userId: true,
      addedWhileOnScreen: true,
    },
    orderBy: {
      id: 'asc',
    },
  })

  const targetItems = await db.watchlistItem.findMany({
    where: { movieId: toId },
    select: {
      id: true,
      userId: true,
      addedWhileOnScreen: true,
    },
  })

  const targetByUserId = new Map(targetItems.map((item) => [item.userId, item]))

  let moved = 0
  let merged = 0

  for (const item of sourceItems) {
    const existing = targetByUserId.get(item.userId)

    if (existing) {
      await db.$executeRaw`
        insert into "WatchlistNotificationDelivery" (
          "watchlistItemId",
          "showtimeId",
          "resendMessageId",
          "sentToEmail",
          "sentAt"
        )
        select
          ${existing.id},
          "showtimeId",
          "resendMessageId",
          "sentToEmail",
          "sentAt"
        from "WatchlistNotificationDelivery"
        where "watchlistItemId" = ${item.id}
        on conflict ("watchlistItemId", "showtimeId") do nothing
      `

      if (existing.addedWhileOnScreen == null && item.addedWhileOnScreen != null) {
        await db.watchlistItem.update({
          where: { id: existing.id },
          data: {
            addedWhileOnScreen: item.addedWhileOnScreen,
          },
        })
      }

      await db.watchlistNotificationDelivery.deleteMany({
        where: { watchlistItemId: item.id },
      })

      await db.watchlistItem.delete({
        where: { id: item.id },
      })

      merged += 1
      continue
    }

    await db.watchlistItem.update({
      where: { id: item.id },
      data: {
        movieId: toId,
      },
    })

    targetByUserId.set(item.userId, {
      ...item,
      id: item.id,
    })
    moved += 1
  }

  return {
    moved,
    merged,
  }
}

async function mergeUserMovieWatches(fromId: number, toId: number, db: DbClient) {
  const sourceWatches = await db.userMovieWatch.findMany({
    where: { movieId: fromId },
    orderBy: {
      id: 'asc',
    },
  })

  const targetWatches = await db.userMovieWatch.findMany({
    where: { movieId: toId },
  })

  const targetByUserId = new Map(targetWatches.map((watch) => [watch.userId, watch]))

  let moved = 0
  let merged = 0

  for (const watch of sourceWatches) {
    const existing = targetByUserId.get(watch.userId)

    if (existing) {
      await db.userMovieWatch.update({
        where: { id: existing.id },
        data: {
          rating: existing.rating ?? watch.rating,
          reviewText: existing.reviewText || watch.reviewText,
          reviewWordCount: Math.max(existing.reviewWordCount, watch.reviewWordCount),
          watchedAt: existing.watchedAt <= watch.watchedAt ? existing.watchedAt : watch.watchedAt,
        },
      })

      await db.userMovieWatch.delete({
        where: { id: watch.id },
      })

      merged += 1
      continue
    }

    await db.userMovieWatch.update({
      where: { id: watch.id },
      data: {
        movieId: toId,
      },
    })

    targetByUserId.set(watch.userId, {
      ...watch,
      id: watch.id,
      movieId: toId,
    })
    moved += 1
  }

  return {
    moved,
    merged,
  }
}

async function mergeDirectorNotifications(fromId: number, toId: number, db: DbClient) {
  const sourceRows = await db.directorWatchlistNotificationDelivery.findMany({
    where: { movieId: fromId },
    select: {
      id: true,
      directorWatchlistItemId: true,
    },
    orderBy: {
      id: 'asc',
    },
  })

  const targetRows = await db.directorWatchlistNotificationDelivery.findMany({
    where: { movieId: toId },
    select: {
      id: true,
      directorWatchlistItemId: true,
    },
  })

  const targetByWatchlistId = new Map(
    targetRows.map((row) => [row.directorWatchlistItemId, row.id])
  )

  let moved = 0
  let deduped = 0

  for (const row of sourceRows) {
    if (targetByWatchlistId.has(row.directorWatchlistItemId)) {
      await db.directorWatchlistNotificationDelivery.delete({
        where: { id: row.id },
      })
      deduped += 1
      continue
    }

    await db.directorWatchlistNotificationDelivery.update({
      where: { id: row.id },
      data: {
        movieId: toId,
      },
    })

    targetByWatchlistId.set(row.directorWatchlistItemId, row.id)
    moved += 1
  }

  return {
    moved,
    deduped,
  }
}

async function mergeMovieRecordsInTransaction(fromId: number, toId: number, tx: DbClient) {
  const sourceMovie = await getMovieOrThrow(fromId, tx)
  const targetMovie = await getMovieOrThrow(toId, tx)

  if (sourceMovie.tmdbId && targetMovie.tmdbId && sourceMovie.tmdbId !== targetMovie.tmdbId) {
    throw new Error(
      `Refusing to merge ${fromId} into ${toId}: both movies have different TMDB ids (${sourceMovie.tmdbId} vs ${targetMovie.tmdbId}).`
    )
  }

  await mergeMovieMetadata(
    toId,
    {
      title: targetMovie.title,
      releaseDate: sourceMovie.releaseDate || undefined,
      releaseYear: sourceMovie.releaseDate?.getUTCFullYear(),
      runtimeMinutes: sourceMovie.runtimeMinutes || undefined,
      overview: sourceMovie.overview || undefined,
      posterUrl: sourceMovie.posterUrl || undefined,
      imdbUrl: sourceMovie.imdbUrl || undefined,
      doubanUrl: sourceMovie.doubanUrl || undefined,
      letterboxdUrl: sourceMovie.letterboxdUrl || undefined,
      officialSiteUrl: sourceMovie.officialSiteUrl || undefined,
      genresText: sourceMovie.genresText || undefined,
      productionCountriesText: sourceMovie.productionCountriesText || undefined,
      directorText: sourceMovie.directorText || undefined,
      titleCandidates: [sourceMovie.originalTitle || undefined].filter(Boolean) as string[],
    },
    tx
  )

  const directMovieMergeData: Record<string, unknown> = {}

  if (!targetMovie.tmdbId && sourceMovie.tmdbId) {
    directMovieMergeData.tmdbId = sourceMovie.tmdbId
  }

  if (!targetMovie.originalTitle && sourceMovie.originalTitle) {
    directMovieMergeData.originalTitle = sourceMovie.originalTitle
  }

  if (!targetMovie.backdropUrl && sourceMovie.backdropUrl) {
    directMovieMergeData.backdropUrl = sourceMovie.backdropUrl
  }

  if (!targetMovie.castText && sourceMovie.castText) {
    directMovieMergeData.castText = sourceMovie.castText
  }

  if (Object.keys(directMovieMergeData).length > 0) {
    await tx.movie.update({
      where: { id: toId },
      data: directMovieMergeData,
    })
  }

  const [showtimes, watchlistItems, watches, directorNotifications] = await Promise.all([
    mergeShowtimes(fromId, toId, targetMovie.title, tx),
    mergeWatchlistItems(fromId, toId, tx),
    mergeUserMovieWatches(fromId, toId, tx),
    mergeDirectorNotifications(fromId, toId, tx),
  ])

  await mergeMovieJoinTables(fromId, toId, tx)

  await tx.movie.delete({
    where: { id: fromId },
  })

  return {
    showtimes,
    watchlistItems,
    watches,
    directorNotifications,
  }
}

export async function mergeMovieRecords(fromId: number, toId: number) {
  return prisma.$transaction((tx) => mergeMovieRecordsInTransaction(fromId, toId, tx))
}

export async function findCanonicalMergeCandidates(
  movie: Pick<Movie, 'id' | 'title' | 'originalTitle' | 'directorText' | 'releaseDate' | 'tmdbId'>,
  params: {
    desiredTmdbId?: number
    seedTitles?: Array<string | undefined>
  },
  db: DbClient = prisma
) {
  const titleCandidates = collectCanonicalMovieTitleCandidates(movie, params.seedTitles)
  const whereClauses = buildCandidateTitleFilters(titleCandidates)

  if (params.desiredTmdbId) {
    whereClauses.push({
      tmdbId: params.desiredTmdbId,
    })
  }

  if (whereClauses.length === 0) {
    return []
  }

  const rows = await db.movie.findMany({
    where: {
      id: {
        not: movie.id,
      },
      OR: whereClauses,
    },
    select: {
      id: true,
      title: true,
      originalTitle: true,
      directorText: true,
      releaseDate: true,
      tmdbId: true,
      posterUrl: true,
      imdbUrl: true,
      _count: {
        select: {
          showtimes: true,
        },
      },
    },
    take: 80,
    orderBy: {
      id: 'asc',
    },
  })

  return rows.filter((candidate) =>
    isLikelyCanonicalDuplicate(movie, candidate, params.seedTitles)
  )
}

export async function reconcileCanonicalMovie(params: {
  movieId: number
  desiredTmdbId?: number
  seedTitles?: Array<string | undefined>
}) {
  const currentMovie = await prisma.movie.findUnique({
    where: { id: params.movieId },
    select: {
      id: true,
      title: true,
      originalTitle: true,
      directorText: true,
      releaseDate: true,
      tmdbId: true,
      posterUrl: true,
      imdbUrl: true,
      _count: {
        select: {
          showtimes: true,
        },
      },
    },
  })

  if (!currentMovie) {
    throw new Error(`Movie ${params.movieId} was not found during canonical reconciliation.`)
  }

  const candidates = await findCanonicalMergeCandidates(
    currentMovie,
    {
      desiredTmdbId: params.desiredTmdbId,
      seedTitles: params.seedTitles,
    },
    prisma
  )

  if (candidates.length === 0) {
    const movie = await prisma.movie.findUnique({
      where: { id: currentMovie.id },
    })

    if (!movie) {
      throw new Error(`Movie ${currentMovie.id} disappeared during reconciliation.`)
    }

    return movie
  }

  const allRows: MergeCandidateMovie[] = [currentMovie, ...candidates]
  const target = [...allRows].sort((left, right) => {
    const scoreDiff =
      scoreCanonicalMovieTarget(right, params.desiredTmdbId) -
      scoreCanonicalMovieTarget(left, params.desiredTmdbId)

    if (scoreDiff !== 0) {
      return scoreDiff
    }

    return left.id - right.id
  })[0]

  const sourceRows = allRows
    .filter((row) => row.id !== target.id)
    .sort((left, right) => {
      if (left.tmdbId && !right.tmdbId) return 1
      if (!left.tmdbId && right.tmdbId) return -1

      const leftDirectorCount = buildDirectorSetSignature(left.directorText).split('|').filter(Boolean).length
      const rightDirectorCount = buildDirectorSetSignature(right.directorText).split('|').filter(Boolean).length
      if (leftDirectorCount !== rightDirectorCount) {
        return leftDirectorCount - rightDirectorCount
      }

      return left.id - right.id
    })

  for (const sourceRow of sourceRows) {
    await mergeMovieRecords(sourceRow.id, target.id)
  }

  const reconciledMovie = await prisma.movie.findUnique({
    where: { id: target.id },
  })

  if (!reconciledMovie) {
    throw new Error(`Movie ${target.id} disappeared after canonical reconciliation.`)
  }

  return reconciledMovie
}
