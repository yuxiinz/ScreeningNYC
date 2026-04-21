import type { Movie } from '@prisma/client'

import { cleanText, getUniqueStrings, normalizeWhitespace } from '@/lib/ingest/core/text'
import { canonicalizeTitle } from '@/lib/ingest/core/screening-title'
import { normalizeMovieName } from '@/lib/movie/normalize'


type MovieIdentityLike = Pick<
  Movie,
  'id' | 'title' | 'originalTitle' | 'directorText' | 'releaseDate' | 'tmdbId'
>

export type CanonicalMergePlanMovie = MovieIdentityLike &
  Pick<Movie, 'posterUrl' | 'imdbUrl'> & {
    showtimeCount?: number
  }

export type CanonicalMergePlan =
  | {
      kind: 'merge'
      target: CanonicalMergePlanMovie
      sources: CanonicalMergePlanMovie[]
    }
  | {
      kind: 'conflict'
      rows: CanonicalMergePlanMovie[]
      tmdbIds: number[]
    }

type DirectorNameParts = {
  first: string
  last: string
}

type TitleOverlapResult =
  | {
      exact: true
    }
  | {
      exact: false
      shorterTitle: string
    }

const MERGE_EXEMPT_PROGRAM_PATTERNS = [
  /\bafter dark\b/i,
  /\bdouble (?:bill|feature)\b/i,
  /\s+\+\s+/,
]

const TRAILING_PROGRAM_HEADER_PATTERN = /\b(?:pgm|program)\s+\d+\s*$/i

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countTitleTokens(value: string) {
  return value.split(/\s+/).filter(Boolean).length
}

function containsStandaloneNormalizedTitle(longerTitle: string, shorterTitle: string) {
  if (!longerTitle || !shorterTitle || shorterTitle.length > longerTitle.length) {
    return false
  }

  const pattern = new RegExp(`(?:^| )${escapeRegExp(shorterTitle)}(?:$| )`)
  return pattern.test(longerTitle)
}

function titleLooksMergeExemptForCanonicalDuplicate(title?: string | null) {
  const cleaned = cleanText(title)
  if (!cleaned) return false

  return (
    TRAILING_PROGRAM_HEADER_PATTERN.test(cleaned) ||
    MERGE_EXEMPT_PROGRAM_PATTERNS.some((pattern) => pattern.test(cleaned))
  )
}

function movieLooksMergeExemptForCanonicalDuplicate(
  movie: Pick<Movie, 'title' | 'originalTitle'>
) {
  return (
    titleLooksMergeExemptForCanonicalDuplicate(movie.title) ||
    titleLooksMergeExemptForCanonicalDuplicate(movie.originalTitle)
  )
}


function splitDirectorNames(input?: string | null) {
  return normalizeWhitespace(input)
    .replace(/^directed by\s*/i, '')
    .split(/\s*(?:,|&| and |\/|;|\+)\s*/i)
    .map((value) => cleanText(value))
    .filter(Boolean)
}

function parseDirectorName(input?: string | null): DirectorNameParts | null {
  const normalized = normalizeMovieName(input)
  if (!normalized) return null

  const parts = normalized.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null

  return {
    first: parts[0] || '',
    last: parts.at(-1) || '',
  }
}

function editDistanceAtMostOne(left: string, right: string) {
  if (left === right) return true

  const leftLength = left.length
  const rightLength = right.length

  if (Math.abs(leftLength - rightLength) > 1) {
    return false
  }

  let leftIndex = 0
  let rightIndex = 0
  let edits = 0

  while (leftIndex < leftLength && rightIndex < rightLength) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1
      rightIndex += 1
      continue
    }

    edits += 1
    if (edits > 1) {
      return false
    }

    if (leftLength > rightLength) {
      leftIndex += 1
    } else if (rightLength > leftLength) {
      rightIndex += 1
    } else {
      leftIndex += 1
      rightIndex += 1
    }
  }

  if (leftIndex < leftLength || rightIndex < rightLength) {
    edits += 1
  }

  return edits <= 1
}

function firstNamesLikelyMatch(left: string, right: string) {
  if (!left || !right) return true
  if (left === right) return true

  const minPrefixLength = Math.min(left.length, right.length, 4)
  if (minPrefixLength >= 3 && left.slice(0, minPrefixLength) === right.slice(0, minPrefixLength)) {
    return true
  }

  return left.startsWith(right) || right.startsWith(left)
}

function lastNamesLikelyMatch(left: string, right: string) {
  if (!left || !right) return true
  if (left === right) return true
  if (left.includes(right) || right.includes(left)) return true

  return editDistanceAtMostOne(left, right)
}

function directorNamesLikelyMatch(left?: string | null, right?: string | null) {
  const leftName = parseDirectorName(left)
  const rightName = parseDirectorName(right)

  if (!leftName || !rightName) return true

  return (
    lastNamesLikelyMatch(leftName.last, rightName.last) &&
    firstNamesLikelyMatch(leftName.first, rightName.first)
  )
}

function titleCandidatesOverlap(
  leftTitles: string[],
  rightTitles: string[]
): TitleOverlapResult | null {
  if (!leftTitles.length || !rightTitles.length) {
    return null
  }

  for (const left of leftTitles) {
    for (const right of rightTitles) {
      if (!left || !right) continue

      if (left === right) {
        return { exact: true }
      }
    }
  }

  for (const left of leftTitles) {
    for (const right of rightTitles) {
      if (!left || !right) continue
      if (left.length < 4 || right.length < 4) continue

      const [shorterTitle, longerTitle] =
        left.length <= right.length ? [left, right] : [right, left]

      // Single-token containment like "CREELEY" inside a longer title is too noisy.
      if (countTitleTokens(shorterTitle) < 2) {
        continue
      }

      if (containsStandaloneNormalizedTitle(longerTitle, shorterTitle)) {
        return {
          exact: false,
          shorterTitle,
        }
      }
    }
  }

  return null
}

function getRawTitleCandidates(values: Array<string | undefined>) {
  return getUniqueStrings(
    values.map((value) => {
      const cleaned = canonicalizeTitle(value || '')
      return cleaned || undefined
    })
  ) ?? []
}

export function getMovieReleaseYear(movie?: Pick<Movie, 'releaseDate'> | null) {
  return movie?.releaseDate ? movie.releaseDate.getUTCFullYear() : undefined
}

export function buildDirectorSetSignature(input?: string | null) {
  const names = splitDirectorNames(input)
    .map((value) => parseDirectorName(value))
    .filter((value): value is DirectorNameParts => Boolean(value))
    .map((value) => `${value.last}:${value.first.slice(0, 4)}`)
    .sort()

  return names.join('|')
}

export function collectCanonicalMovieTitleCandidates(
  movie: Pick<Movie, 'title' | 'originalTitle'>,
  extraTitles: Array<string | undefined> = []
) {
  return getRawTitleCandidates([
    movie.title,
    movie.originalTitle || undefined,
    ...extraTitles,
  ])
}

export function titleLooksSuspiciousForCanonicalMerge(title?: string | null) {
  const cleaned = cleanText(title)
  if (!cleaned) return false

  return (
    cleaned !== canonicalizeTitle(cleaned) ||
    /\\u[0-9a-fA-F]{4}/.test(cleaned) ||
    titleLooksMergeExemptForCanonicalDuplicate(cleaned) ||
    /\bpresents:?\b/i.test(cleaned) ||
    /\b(q(?:\s*&\s*|\s+and\s+)a|q&a|qa|in person|discussion|panel|conversation|filmmaker|director|guest|live score)\b/i.test(
      cleaned
    )
  )
}

export function pickDistinctOriginalTitle(
  preferredTitle: string,
  candidates: Array<string | undefined>
) {
  const normalizedPreferredTitle = normalizeMovieName(preferredTitle)

  for (const candidate of candidates) {
    const cleaned = canonicalizeTitle(candidate || '')
    if (!cleaned) continue

    if (normalizeMovieName(cleaned) !== normalizedPreferredTitle) {
      return cleaned
    }
  }

  return undefined
}

export function directorTextLikelyMatches(left?: string | null, right?: string | null) {
  const leftNames = splitDirectorNames(left)
  const rightNames = splitDirectorNames(right)

  if (leftNames.length === 0 || rightNames.length === 0) {
    return true
  }

  const [smaller, larger] =
    leftNames.length <= rightNames.length
      ? [leftNames, rightNames]
      : [rightNames, leftNames]

  return smaller.every((leftName) =>
    larger.some((rightName) => directorNamesLikelyMatch(leftName, rightName))
  )
}

export function isLikelyCanonicalDuplicate(
  targetMovie: MovieIdentityLike,
  candidateMovie: MovieIdentityLike,
  extraTargetTitles: Array<string | undefined> = []
) {
  if (targetMovie.id === candidateMovie.id) {
    return false
  }

  if (
    targetMovie.tmdbId &&
    candidateMovie.tmdbId &&
    targetMovie.tmdbId !== candidateMovie.tmdbId
  ) {
    return false
  }

  const targetTitles = collectCanonicalMovieTitleCandidates(targetMovie, extraTargetTitles).map(
    normalizeMovieName
  )
  const candidateTitles = collectCanonicalMovieTitleCandidates(candidateMovie).map(
    normalizeMovieName
  )
  const titleOverlap = titleCandidatesOverlap(targetTitles, candidateTitles)

  if (!titleOverlap) {
    return false
  }

  if (
    !titleOverlap.exact &&
    (movieLooksMergeExemptForCanonicalDuplicate(targetMovie) ||
      movieLooksMergeExemptForCanonicalDuplicate(candidateMovie))
  ) {
    return false
  }

  const hasDirectorInfo = Boolean(targetMovie.directorText || candidateMovie.directorText)
  if (hasDirectorInfo && !directorTextLikelyMatches(targetMovie.directorText, candidateMovie.directorText)) {
    return false
  }

  if (
    !hasDirectorInfo &&
    !targetMovie.tmdbId &&
    !candidateMovie.tmdbId
  ) {
    return false
  }

  if (targetMovie.tmdbId || candidateMovie.tmdbId) {
    return true
  }

  const targetYear = getMovieReleaseYear(targetMovie)
  const candidateYear = getMovieReleaseYear(candidateMovie)

  if (targetYear && candidateYear) {
    return Math.abs(targetYear - candidateYear) <= 1
  }

  return true
}

export function scoreCanonicalMovieTarget(
  movie: Pick<
    Movie,
    'title' | 'originalTitle' | 'posterUrl' | 'imdbUrl' | 'tmdbId'
  > & {
    showtimeCount?: number
  },
  desiredTmdbId?: number
) {
  let score = 0

  if (desiredTmdbId && movie.tmdbId === desiredTmdbId) {
    score += 5_000
  } else if (movie.tmdbId) {
    score += 2_000
  }

  if (movie.title === canonicalizeTitle(movie.title)) {
    score += 120
  }

  if (movie.originalTitle) {
    score += 70
  }

  if (movie.imdbUrl) {
    score += 40
  }

  if (movie.posterUrl) {
    score += 20
  }

  score += Math.min(movie.showtimeCount || 0, 25)

  if (!titleLooksSuspiciousForCanonicalMerge(movie.title)) {
    score += 50
  }

  return score
}

function countDirectorNames(input?: string | null) {
  return buildDirectorSetSignature(input).split('|').filter(Boolean).length
}

export function planCanonicalMovieMerge(params: {
  currentMovie: CanonicalMergePlanMovie
  candidates: CanonicalMergePlanMovie[]
  desiredTmdbId?: number
}): CanonicalMergePlan {
  const rows = [params.currentMovie, ...params.candidates]
  const tmdbIds = [...new Set(
    rows
      .map((row) => row.tmdbId)
      .filter((tmdbId): tmdbId is number => typeof tmdbId === 'number')
  )].sort((left, right) => left - right)

  if (tmdbIds.length > 1) {
    return {
      kind: 'conflict',
      rows,
      tmdbIds,
    }
  }

  const target = [...rows].sort((left, right) => {
    const scoreDiff =
      scoreCanonicalMovieTarget(right, params.desiredTmdbId) -
      scoreCanonicalMovieTarget(left, params.desiredTmdbId)

    if (scoreDiff !== 0) {
      return scoreDiff
    }

    return left.id - right.id
  })[0]

  const sources = rows
    .filter((row) => row.id !== target.id)
    .sort((left, right) => {
      if (left.tmdbId && !right.tmdbId) return 1
      if (!left.tmdbId && right.tmdbId) return -1

      const leftDirectorCount = countDirectorNames(left.directorText)
      const rightDirectorCount = countDirectorNames(right.directorText)
      if (leftDirectorCount !== rightDirectorCount) {
        return leftDirectorCount - rightDirectorCount
      }

      return left.id - right.id
    })

  return {
    kind: 'merge',
    target,
    sources,
  }
}
