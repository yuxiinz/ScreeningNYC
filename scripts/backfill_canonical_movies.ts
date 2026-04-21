import 'dotenv/config'

import { Prisma } from '@prisma/client'

import {
  disconnectPrisma,
  type FallbackMovieData,
  upsertMovie,
} from '@/lib/ingest/services/persist-service'
import { canonicalizeTitle } from '@/lib/ingest/core/screening-title'
import {
  searchTmdbMovie,
  type TmdbMovie,
} from '@/lib/ingest/services/tmdb-service'
import {
  collectCanonicalMovieTitleCandidates,
  getMovieReleaseYear,
  pickDistinctOriginalTitle,
  scoreCanonicalMovieTarget,
} from '@/lib/movie/canonical'
import {
  findCanonicalMergeCandidates,
  reconcileCanonicalMovie,
} from '@/lib/movie/merge-service'
import { fetchTmdbMovieById } from '@/lib/movie/resolve'
import { prisma } from '@/lib/prisma'
import {
  getTmdbApiKey,
  TmdbApiKeyMissingError,
} from '@/lib/tmdb/client'

const backfillMovieSelect = Prisma.validator<Prisma.MovieSelect>()({
  id: true,
  tmdbId: true,
  title: true,
  originalTitle: true,
  releaseDate: true,
  runtimeMinutes: true,
  overview: true,
  posterUrl: true,
  imdbUrl: true,
  doubanUrl: true,
  letterboxdUrl: true,
  officialSiteUrl: true,
  genresText: true,
  directorText: true,
  productionCountriesText: true,
  _count: {
    select: {
      showtimes: true,
    },
  },
})

type BackfillMovie = Prisma.MovieGetPayload<{
  select: typeof backfillMovieSelect
}>

type MergePlannerMovie = {
  id: number
  title: string
  originalTitle: string | null
  directorText: string | null
  releaseDate: Date | null
  tmdbId: number | null
  posterUrl: string | null
  imdbUrl: string | null
  showtimeCount: number
}

type CliOptions = {
  dryRun: boolean
  ids?: number[]
  limit?: number
  skipTmdb: boolean
  skipLocalMerge: boolean
}

type BackfillStats = {
  scanned: number
  localTitleCleanups: number
  tmdbRefreshes: number
  tmdbRefreshMerges: number
  tmdbMatches: number
  tmdbMatchMerges: number
  tmdbMisses: number
  tmdbSkipped: number
  localMergeGroups: number
  localRowsMerged: number
}

function parseIds(value?: string) {
  if (!value) {
    return undefined
  }

  const ids = value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0)

  if (ids.length === 0) {
    throw new Error(`Invalid --ids value: ${value}`)
  }

  return [...new Set(ids)].sort((left, right) => left - right)
}

function parsePositiveInt(value: string, flagName: string) {
  const parsed = Number.parseInt(value, 10)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${flagName} value: ${value}`)
  }

  return parsed
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    skipTmdb: false,
    skipLocalMerge: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--skip-tmdb') {
      options.skipTmdb = true
      continue
    }

    if (arg === '--skip-local-merge') {
      options.skipLocalMerge = true
      continue
    }

    if (arg === '--limit') {
      const value = argv[index + 1]

      if (!value) {
        throw new Error('Usage: --limit <number>')
      }

      options.limit = parsePositiveInt(value, '--limit')
      index += 1
      continue
    }

    if (arg === '--ids') {
      const value = argv[index + 1]

      if (!value) {
        throw new Error('Usage: --ids <id1,id2,...>')
      }

      options.ids = parseIds(value)
      index += 1
      continue
    }

    throw new Error(
      `Unknown argument: ${arg}\nUsage: tsx scripts/backfill_canonical_movies.ts [--dry-run] [--limit <n>] [--ids <id1,id2,...>] [--skip-tmdb] [--skip-local-merge]`
    )
  }

  return options
}

function normalizeNullableString(input?: string | null) {
  const trimmed = input?.trim()
  return trimmed || null
}

function getCanonicalStoredTitle(input?: string | null) {
  return canonicalizeTitle(input || '') || normalizeNullableString(input) || 'Untitled'
}

function buildCanonicalStoredFields(movie: Pick<BackfillMovie, 'title' | 'originalTitle'>) {
  const title = getCanonicalStoredTitle(movie.title)
  const originalTitle = pickDistinctOriginalTitle(title, [
    canonicalizeTitle(movie.originalTitle || '') || normalizeNullableString(movie.originalTitle) || undefined,
  ])

  return {
    title,
    originalTitle: originalTitle || null,
  }
}

function buildTitleSeedTitles(
  movie: Pick<BackfillMovie, 'title' | 'originalTitle'>,
  extraTitles: Array<string | undefined> = []
) {
  return collectCanonicalMovieTitleCandidates(
    {
      title: getCanonicalStoredTitle(movie.title),
      originalTitle:
        canonicalizeTitle(movie.originalTitle || '') ||
        normalizeNullableString(movie.originalTitle),
    },
    extraTitles
  )
}

function buildFallbackFromMovie(movie: BackfillMovie): FallbackMovieData {
  const normalizedFields = buildCanonicalStoredFields(movie)
  const titleCandidates = buildTitleSeedTitles(movie).filter(
    (candidate) => candidate.toLowerCase() !== normalizedFields.title.toLowerCase()
  )

  return {
    title: normalizedFields.title,
    titleCandidates,
    directorText: normalizeNullableString(movie.directorText) || undefined,
    releaseDate: movie.releaseDate || undefined,
    releaseYear: getMovieReleaseYear(movie),
    runtimeMinutes: movie.runtimeMinutes || undefined,
    overview: normalizeNullableString(movie.overview) || undefined,
    posterUrl: normalizeNullableString(movie.posterUrl) || undefined,
    imdbUrl: normalizeNullableString(movie.imdbUrl) || undefined,
    doubanUrl: normalizeNullableString(movie.doubanUrl) || undefined,
    letterboxdUrl: normalizeNullableString(movie.letterboxdUrl) || undefined,
    officialSiteUrl: normalizeNullableString(movie.officialSiteUrl) || undefined,
    genresText: normalizeNullableString(movie.genresText) || undefined,
    productionCountriesText:
      normalizeNullableString(movie.productionCountriesText) || undefined,
  }
}

function buildPlannerMovie(
  movie:
    | BackfillMovie
    | (Awaited<ReturnType<typeof findCanonicalMergeCandidates>>)[number]
): MergePlannerMovie {
  return {
    id: movie.id,
    title: movie.title,
    originalTitle: movie.originalTitle,
    directorText: movie.directorText,
    releaseDate: movie.releaseDate,
    tmdbId: movie.tmdbId,
    posterUrl: 'posterUrl' in movie ? movie.posterUrl : null,
    imdbUrl: 'imdbUrl' in movie ? movie.imdbUrl : null,
    showtimeCount: movie._count.showtimes,
  }
}

function pickPlannedTarget(
  currentMovie: BackfillMovie,
  candidates: Awaited<ReturnType<typeof findCanonicalMergeCandidates>>,
  desiredTmdbId?: number
) {
  return [buildPlannerMovie(currentMovie), ...candidates.map((row) => buildPlannerMovie(row))]
    .sort((left, right) => {
      const scoreDiff =
        scoreCanonicalMovieTarget(right, desiredTmdbId) -
        scoreCanonicalMovieTarget(left, desiredTmdbId)

      if (scoreDiff !== 0) {
        return scoreDiff
      }

      return left.id - right.id
    })[0]
}

async function normalizeStoredMovieTitleFields(
  movie: BackfillMovie,
  dryRun: boolean
) {
  const nextFields = buildCanonicalStoredFields(movie)
  const titleChanged = nextFields.title !== movie.title
  const originalTitleChanged =
    nextFields.originalTitle !== (movie.originalTitle || null)

  if (!titleChanged && !originalTitleChanged) {
    return {
      updated: false,
      movie,
    }
  }

  if (dryRun) {
    console.log(
      `[backfill_canonical_movies] dry-run local-cleanup movie ${movie.id}: "${movie.title}" -> "${nextFields.title}"${originalTitleChanged ? ` | originalTitle=${JSON.stringify(nextFields.originalTitle)}` : ''}`
    )

    return {
      updated: true,
      movie: {
        ...movie,
        title: nextFields.title,
        originalTitle: nextFields.originalTitle,
      },
    }
  }

  const updatedMovie = await prisma.movie.update({
    where: { id: movie.id },
    data: nextFields,
    select: backfillMovieSelect,
  })

  console.log(
    `[backfill_canonical_movies] local-cleanup movie ${movie.id}: "${movie.title}" -> "${updatedMovie.title}"`
  )

  return {
    updated: true,
    movie: updatedMovie,
  }
}

async function findCurrentMovie(movieId: number) {
  return prisma.movie.findUnique({
    where: { id: movieId },
    select: backfillMovieSelect,
  })
}

function buildTmdbSeedTitles(movie: BackfillMovie, tmdb: TmdbMovie) {
  return buildTitleSeedTitles(movie, [
    tmdb.title,
    tmdb.originalTitle,
    tmdb.matchedQueryTitle,
  ])
}

async function planTmdbRefresh(movie: BackfillMovie, tmdb: TmdbMovie) {
  const candidates = await findCanonicalMergeCandidates(movie, {
    desiredTmdbId: tmdb.tmdbId,
    seedTitles: buildTmdbSeedTitles(movie, tmdb),
  })
  const target = pickPlannedTarget(movie, candidates, tmdb.tmdbId)
  const nextTitle = getCanonicalStoredTitle(tmdb.title)
  const nextOriginalTitle =
    pickDistinctOriginalTitle(nextTitle, [
      tmdb.originalTitle,
      movie.originalTitle || undefined,
      movie.title,
    ]) || null

  return {
    candidates,
    target,
    nextTitle,
    nextOriginalTitle,
  }
}

async function runTmdbRefreshStage(
  baseMovies: BackfillMovie[],
  options: CliOptions,
  stats: BackfillStats
) {
  const plannedMergedIds = new Set<number>()

  for (const movie of baseMovies) {
    if (!movie.tmdbId) {
      continue
    }

    const currentMovie = await findCurrentMovie(movie.id)
    if (!currentMovie || !currentMovie.tmdbId) {
      continue
    }

    const tmdb = await fetchTmdbMovieById(currentMovie.tmdbId)

    if (options.dryRun) {
      const plan = await planTmdbRefresh(currentMovie, tmdb)
      const titleChanged =
        currentMovie.title !== plan.nextTitle ||
        (currentMovie.originalTitle || null) !== plan.nextOriginalTitle

      if (plan.candidates.length > 0) {
        const groupIds = [currentMovie.id, ...plan.candidates.map((row) => row.id)]
        groupIds.forEach((id) => plannedMergedIds.add(id))
      }

      if (titleChanged || plan.candidates.length > 0) {
        console.log(
          `[backfill_canonical_movies] dry-run tmdb-refresh movie ${currentMovie.id}: title="${currentMovie.title}" -> "${plan.nextTitle}" target=${plan.target.id} mergeSources=${plan.candidates.map((row) => row.id).join(',') || 'none'}`
        )
      }

      stats.tmdbRefreshes += 1
      if (plan.target.id !== currentMovie.id || plan.candidates.length > 0) {
        stats.tmdbRefreshMerges += plan.candidates.length
      }
      continue
    }

    const resolvedMovie = await upsertMovie(tmdb, buildFallbackFromMovie(currentMovie))

    stats.tmdbRefreshes += 1

    if (resolvedMovie.id !== currentMovie.id) {
      stats.tmdbRefreshMerges += 1
    }

    console.log(
      `[backfill_canonical_movies] tmdb-refresh movie ${currentMovie.id} -> ${resolvedMovie.id}: "${currentMovie.title}" => "${resolvedMovie.title}"`
    )
  }

  return plannedMergedIds
}

async function runTmdbSearchStage(
  baseMovies: BackfillMovie[],
  options: CliOptions,
  tmdbApiKey: string | undefined,
  skipMovieIds: Set<number>,
  stats: BackfillStats
) {
  const plannedTmdbResolvedIds = new Set<number>()
  const seenDryRunGroups = new Set<string>()

  if (!tmdbApiKey) {
    const nonTmdbMovieCount = baseMovies.filter((movie) => !movie.tmdbId).length
    stats.tmdbSkipped += nonTmdbMovieCount

    if (nonTmdbMovieCount > 0) {
      console.warn(
        '[backfill_canonical_movies] TMDB_API_KEY is not configured. Skipping TMDB lookup for local-only movies.'
      )
    }

    return plannedTmdbResolvedIds
  }

  for (const movie of baseMovies) {
    if (movie.tmdbId || skipMovieIds.has(movie.id)) {
      continue
    }

    const currentMovie = await findCurrentMovie(movie.id)
    if (!currentMovie || currentMovie.tmdbId || skipMovieIds.has(currentMovie.id)) {
      continue
    }

    const fallback = buildFallbackFromMovie(currentMovie)
    const tmdb = await searchTmdbMovie({
      title: fallback.title,
      titleCandidates: fallback.titleCandidates,
      directorText: fallback.directorText,
      releaseYear: fallback.releaseYear,
      runtimeMinutes: fallback.runtimeMinutes,
      tmdbApiKey,
    })

    if (!tmdb.tmdbId) {
      stats.tmdbMisses += 1
      continue
    }

    plannedTmdbResolvedIds.add(currentMovie.id)

    if (options.dryRun) {
      const candidates = await findCanonicalMergeCandidates(currentMovie, {
        desiredTmdbId: tmdb.tmdbId,
        seedTitles: buildTmdbSeedTitles(currentMovie, tmdb),
      })
      const target = pickPlannedTarget(currentMovie, candidates, tmdb.tmdbId)
      const groupIds = [currentMovie.id, ...candidates.map((row) => row.id)].sort(
        (left, right) => left - right
      )
      const groupKey = groupIds.join(',')

      groupIds.forEach((id) => plannedTmdbResolvedIds.add(id))

      if (seenDryRunGroups.has(groupKey)) {
        continue
      }

      seenDryRunGroups.add(groupKey)

      console.log(
        `[backfill_canonical_movies] dry-run tmdb-match movie ${currentMovie.id}: "${currentMovie.title}" -> tmdb ${tmdb.tmdbId} "${tmdb.title}" target=${target.id} mergeSources=${candidates.map((row) => row.id).join(',') || 'none'}`
      )

      stats.tmdbMatches += 1
      if (target.id !== currentMovie.id || candidates.length > 0) {
        stats.tmdbMatchMerges += candidates.length || Number(target.id !== currentMovie.id)
      }
      continue
    }

    const resolvedMovie = await upsertMovie(tmdb, fallback)
    stats.tmdbMatches += 1

    if (resolvedMovie.id !== currentMovie.id) {
      stats.tmdbMatchMerges += 1
    }

    console.log(
      `[backfill_canonical_movies] tmdb-match movie ${currentMovie.id} -> ${resolvedMovie.id}: "${currentMovie.title}" => "${resolvedMovie.title}" (tmdb ${tmdb.tmdbId})`
    )
  }

  return plannedTmdbResolvedIds
}

async function runLocalMergeStage(
  baseMovies: BackfillMovie[],
  options: CliOptions,
  plannedTmdbResolvedIds: Set<number>,
  stats: BackfillStats
) {
  if (options.skipLocalMerge) {
    return
  }

  if (options.dryRun) {
    const seenMovieIds = new Set<number>()

    for (const movie of baseMovies) {
      if (movie.tmdbId || plannedTmdbResolvedIds.has(movie.id) || seenMovieIds.has(movie.id)) {
        continue
      }

      const currentMovie = await findCurrentMovie(movie.id)
      if (!currentMovie || currentMovie.tmdbId || seenMovieIds.has(currentMovie.id)) {
        continue
      }

      const candidates = await findCanonicalMergeCandidates(currentMovie, {
        seedTitles: buildTitleSeedTitles(currentMovie),
      })

      if (candidates.length === 0) {
        continue
      }

      const target = pickPlannedTarget(currentMovie, candidates)
      const groupIds = [currentMovie.id, ...candidates.map((row) => row.id)]

      groupIds.forEach((id) => seenMovieIds.add(id))

      stats.localMergeGroups += 1
      stats.localRowsMerged += candidates.length

      console.log(
        `[backfill_canonical_movies] dry-run local-merge target=${target.id} title="${target.title}" sources=${groupIds.filter((id) => id !== target.id).join(',')}`
      )
    }

    return
  }

  const remainingMovies = await prisma.movie.findMany({
    where: {
      ...(options.ids ? { id: { in: options.ids } } : {}),
      tmdbId: null,
    },
    select: backfillMovieSelect,
    orderBy: {
      id: 'asc',
    },
  })

  for (const movie of remainingMovies) {
    const currentMovie = await findCurrentMovie(movie.id)
    if (!currentMovie || currentMovie.tmdbId) {
      continue
    }

    const candidates = await findCanonicalMergeCandidates(currentMovie, {
      seedTitles: buildTitleSeedTitles(currentMovie),
    })

    if (candidates.length === 0) {
      continue
    }

    const reconciledMovie = await reconcileCanonicalMovie({
      movieId: currentMovie.id,
      seedTitles: buildTitleSeedTitles(currentMovie),
    })

    stats.localMergeGroups += 1
    stats.localRowsMerged += candidates.length

    console.log(
      `[backfill_canonical_movies] local-merge movie ${currentMovie.id} -> ${reconciledMovie.id}: merged=${candidates.map((row) => row.id).join(',')}`
    )
  }
}

async function loadBaseMovies(options: CliOptions) {
  return prisma.movie.findMany({
    where: options.ids
      ? {
          id: {
            in: options.ids,
          },
        }
      : undefined,
    select: backfillMovieSelect,
    orderBy: {
      id: 'asc',
    },
    ...(options.limit ? { take: options.limit } : {}),
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const baseMovies = await loadBaseMovies(options)
  const stats: BackfillStats = {
    scanned: baseMovies.length,
    localTitleCleanups: 0,
    tmdbRefreshes: 0,
    tmdbRefreshMerges: 0,
    tmdbMatches: 0,
    tmdbMatchMerges: 0,
    tmdbMisses: 0,
    tmdbSkipped: 0,
    localMergeGroups: 0,
    localRowsMerged: 0,
  }

  let tmdbApiKey: string | undefined

  if (!options.skipTmdb) {
    try {
      tmdbApiKey = getTmdbApiKey()
    } catch (error) {
      if (!(error instanceof TmdbApiKeyMissingError)) {
        throw error
      }
    }
  }

  if (options.skipTmdb) {
    stats.tmdbSkipped += baseMovies.length
  } else if (!tmdbApiKey) {
    stats.tmdbSkipped += baseMovies.length
    console.warn(
      '[backfill_canonical_movies] TMDB_API_KEY is not configured. Skipping all TMDB refresh and lookup stages.'
    )
  }

  for (const movie of baseMovies) {
    const currentMovie = await findCurrentMovie(movie.id)
    if (!currentMovie) {
      continue
    }

    const result = await normalizeStoredMovieTitleFields(currentMovie, options.dryRun)
    if (result.updated) {
      stats.localTitleCleanups += 1
    }
  }

  const plannedTmdbRefreshIds =
    options.skipTmdb || !tmdbApiKey
      ? new Set<number>()
      : await runTmdbRefreshStage(baseMovies, options, stats)

  const plannedTmdbResolvedIds = options.skipTmdb || !tmdbApiKey
    ? new Set<number>()
    : await runTmdbSearchStage(
        baseMovies,
        options,
        tmdbApiKey,
        plannedTmdbRefreshIds,
        stats
      )

  const plannedTmdbMergeIds = new Set<number>([
    ...plannedTmdbRefreshIds,
    ...plannedTmdbResolvedIds,
  ])

  await runLocalMergeStage(baseMovies, options, plannedTmdbMergeIds, stats)

  console.log(
    `[backfill_canonical_movies] completed${options.dryRun ? ' (dry-run)' : ''}. scanned=${stats.scanned} localTitleCleanups=${stats.localTitleCleanups} tmdbRefreshes=${stats.tmdbRefreshes} tmdbRefreshMerges=${stats.tmdbRefreshMerges} tmdbMatches=${stats.tmdbMatches} tmdbMatchMerges=${stats.tmdbMatchMerges} tmdbMisses=${stats.tmdbMisses} tmdbSkipped=${stats.tmdbSkipped} localMergeGroups=${stats.localMergeGroups} localRowsMerged=${stats.localRowsMerged}`
  )
}

main()
  .catch((error) => {
    console.error('[backfill_canonical_movies] Failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectPrisma()
  })
