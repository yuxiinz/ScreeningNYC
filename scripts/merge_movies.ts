import 'dotenv/config'
import { Prisma } from '@prisma/client'

import { prisma } from '../lib/prisma'
import {
  buildFingerprint,
  disconnectPrisma,
  mergeMovieMetadata,
} from '../lib/ingest/services/persist_service'

type DbClient = typeof prisma | Prisma.TransactionClient

type CliArgs = {
  fromId: number
  toId: number
  dryRun: boolean
}

type MergeStats = {
  showtimesMoved: number
  showtimesDeduped: number
  watchlistItemsMoved: number
  watchlistItemsMerged: number
  watchesMoved: number
  watchesMerged: number
  directorNotificationsMoved: number
  directorNotificationsDeduped: number
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)

  function readFlag(name: string) {
    const index = args.findIndex((arg) => arg === name)
    if (index === -1) return undefined
    return args[index + 1]
  }

  const fromId = Number(readFlag('--from'))
  const toId = Number(readFlag('--to'))
  const dryRun = args.includes('--dry-run')

  if (!Number.isInteger(fromId) || !Number.isInteger(toId) || fromId <= 0 || toId <= 0) {
    throw new Error('Usage: tsx scripts/merge_movies.ts --from <sourceMovieId> --to <targetMovieId> [--dry-run]')
  }

  if (fromId === toId) {
    throw new Error('--from and --to must be different movie ids.')
  }

  return {
    fromId,
    toId,
    dryRun,
  }
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

async function getMovieSummary(movieId: number, db: DbClient) {
  const [
    showtimes,
    watchlistItems,
    watches,
    directorNotifications,
    peopleLinks,
    tagLinks,
  ] = await Promise.all([
    db.showtime.count({ where: { movieId } }),
    db.watchlistItem.count({ where: { movieId } }),
    db.userMovieWatch.count({ where: { movieId } }),
    db.directorWatchlistNotificationDelivery.count({ where: { movieId } }),
    db.moviePerson.count({ where: { movieId } }),
    db.movieTag.count({ where: { movieId } }),
  ])

  return {
    showtimes,
    watchlistItems,
    watches,
    directorNotifications,
    peopleLinks,
    tagLinks,
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
      startTime: true,
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
    },
  })

  const fingerprintOwners = new Map<string, number>()

  for (const showtime of targetShowtimes) {
    if (showtime.fingerprint) {
      fingerprintOwners.set(showtime.fingerprint, showtime.id)
    }
  }

  let moved = 0
  let deduped = 0

  for (const showtime of sourceShowtimes) {
    const newFingerprint = buildFingerprint({
      theaterSlug: showtime.theater.slug,
      movieTitle: targetTitle,
      startTimeUtcIso: showtime.startTime.toISOString(),
      formatName: showtime.format?.name || 'Standard',
    })

    const existingShowtimeId = fingerprintOwners.get(newFingerprint)

    if (existingShowtimeId && existingShowtimeId !== showtime.id) {
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
          ${existingShowtimeId},
          "resendMessageId",
          "sentToEmail",
          "sentAt"
        from "WatchlistNotificationDelivery"
        where "showtimeId" = ${showtime.id}
        on conflict ("watchlistItemId", "showtimeId") do nothing
      `

      await db.watchlistNotificationDelivery.deleteMany({
        where: { showtimeId: showtime.id },
      })

      await db.showtime.delete({
        where: { id: showtime.id },
      })

      deduped += 1
      continue
    }

    await db.showtime.update({
      where: { id: showtime.id },
      data: {
        movieId: toId,
        fingerprint: newFingerprint,
      },
    })

    fingerprintOwners.set(newFingerprint, showtime.id)
    moved += 1
  }

  return {
    moved,
    deduped,
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

async function mergeMovieRecords(fromId: number, toId: number) {
  return prisma.$transaction(async (tx) => {
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
  })
}

function printMovieSummary(label: string, movie: Awaited<ReturnType<typeof prisma.movie.findUnique>>, summary: Awaited<ReturnType<typeof getMovieSummary>>) {
  if (!movie) {
    return
  }

  console.log(
    [
      `${label}: id=${movie.id}`,
      `title=${movie.title}`,
      `tmdbId=${movie.tmdbId ?? 'null'}`,
      `poster=${movie.posterUrl ? 'yes' : 'no'}`,
      `showtimes=${summary.showtimes}`,
      `watchlistItems=${summary.watchlistItems}`,
      `watches=${summary.watches}`,
      `directorNotifications=${summary.directorNotifications}`,
      `peopleLinks=${summary.peopleLinks}`,
      `tagLinks=${summary.tagLinks}`,
    ].join(' | ')
  )
}

async function main() {
  const { fromId, toId, dryRun } = parseArgs()
  const [sourceMovie, targetMovie, sourceSummary, targetSummary] = await Promise.all([
    prisma.movie.findUnique({ where: { id: fromId } }),
    prisma.movie.findUnique({ where: { id: toId } }),
    getMovieSummary(fromId, prisma),
    getMovieSummary(toId, prisma),
  ])

  if (!sourceMovie) {
    throw new Error(`Movie ${fromId} was not found.`)
  }

  if (!targetMovie) {
    throw new Error(`Movie ${toId} was not found.`)
  }

  console.log(
    `[merge_movies] ${dryRun ? 'Dry run' : 'Merging'} movie ${fromId} into ${toId}`
  )
  printMovieSummary('source', sourceMovie, sourceSummary)
  printMovieSummary('target', targetMovie, targetSummary)

  if (dryRun) {
    console.log('[merge_movies] No changes written.')
    return
  }

  const result = await mergeMovieRecords(fromId, toId)

  const [mergedMovie, mergedSummary] = await Promise.all([
    prisma.movie.findUnique({ where: { id: toId } }),
    getMovieSummary(toId, prisma),
  ])

  const stats: MergeStats = {
    showtimesMoved: result.showtimes.moved,
    showtimesDeduped: result.showtimes.deduped,
    watchlistItemsMoved: result.watchlistItems.moved,
    watchlistItemsMerged: result.watchlistItems.merged,
    watchesMoved: result.watches.moved,
    watchesMerged: result.watches.merged,
    directorNotificationsMoved: result.directorNotifications.moved,
    directorNotificationsDeduped: result.directorNotifications.deduped,
  }

  console.log('[merge_movies] Merge completed.')
  printMovieSummary('target', mergedMovie, mergedSummary)
  console.log(JSON.stringify(stats, null, 2))
}

main()
  .catch((error) => {
    console.error('[merge_movies] Failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectPrisma()
  })
