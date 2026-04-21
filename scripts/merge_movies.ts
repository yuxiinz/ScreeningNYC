import 'dotenv/config'

import { prisma } from '../lib/prisma'
import {
  getMovieSummary,
  mergeMovieRecords,
  type MergeMovieStats,
} from '../lib/movie/merge-service'
import { disconnectPrisma } from '../lib/ingest/services/persist-service'

type CliArgs = {
  fromId: number
  toId: number
  dryRun: boolean
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

function printMovieSummary(
  label: string,
  movie: Awaited<ReturnType<typeof prisma.movie.findUnique>>,
  summary: Awaited<ReturnType<typeof getMovieSummary>>
) {
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
      `marketplacePosts=${summary.marketplacePosts}`,
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

  const stats: MergeMovieStats = {
    showtimesMoved: result.showtimes.moved,
    showtimesDeduped: result.showtimes.deduped,
    marketplacePostsMoved: result.showtimes.marketplacePostsMoved,
    marketplacePostsMerged: result.showtimes.marketplacePostsMerged,
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
