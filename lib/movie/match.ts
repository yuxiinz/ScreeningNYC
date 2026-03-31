import type { Movie, Prisma } from '@prisma/client'

import { canonicalizeTitle } from '@/lib/ingest/services/tmdb_service'
import { prisma } from '@/lib/prisma'

type DbClient = typeof prisma | Prisma.TransactionClient

export type MovieMatchInput = {
  title?: string
  titleCandidates?: string[]
  directorText?: string
  releaseYear?: number
  tmdbId?: number
  imdbId?: string
  doubanUrl?: string
  letterboxdUrl?: string
}

export function normalizeMovieName(input?: string | null): string {
  return canonicalizeTitle(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeDirectorName(input?: string | null): string {
  return (input || '')
    .replace(/^directed by\s*/i, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9,\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractImdbIdFromUrl(input?: string | null): string | null {
  const match = (input || '').match(/tt\d{7,10}/i)
  return match?.[0]?.toLowerCase() || null
}

function normalizeResourceUrl(input?: string | null): string | null {
  const trimmed = (input || '').trim()

  if (!trimmed) {
    return null
  }

  try {
    const url = new URL(trimmed)
    url.hash = ''

    return url.toString().replace(/\/+$/, '')
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

function getTitleCandidates(input: MovieMatchInput) {
  const rawCandidates = [
    input.title || '',
    ...(input.titleCandidates || []),
  ]

  const deduped = new Map<string, string>()

  rawCandidates.forEach((candidate) => {
    const canonical = canonicalizeTitle(candidate)
    const normalized = normalizeMovieName(canonical)

    if (canonical && normalized && !deduped.has(normalized)) {
      deduped.set(normalized, canonical)
    }
  })

  return [...deduped.values()]
}

function getMovieReleaseYear(movie: Pick<Movie, 'releaseDate'>) {
  return movie.releaseDate ? new Date(movie.releaseDate).getUTCFullYear() : undefined
}

function directorMatches(inputDirector?: string, movieDirector?: string | null) {
  const normalizedInput = normalizeDirectorName(inputDirector)
  const normalizedMovie = normalizeDirectorName(movieDirector)

  if (!normalizedInput || !normalizedMovie) {
    return true
  }

  return (
    normalizedInput === normalizedMovie ||
    normalizedInput.includes(normalizedMovie) ||
    normalizedMovie.includes(normalizedInput)
  )
}

function yearMatches(inputYear?: number, movie?: Pick<Movie, 'releaseDate'> | null) {
  if (!inputYear) return true

  const movieYear = movie ? getMovieReleaseYear(movie) : undefined
  if (!movieYear) return true

  return movieYear === inputYear
}

function scoreMovieCandidate(
  movie: Pick<Movie, 'title' | 'originalTitle' | 'directorText' | 'releaseDate' | 'tmdbId' | 'posterUrl'>,
  input: MovieMatchInput
) {
  const normalizedTitles = getTitleCandidates(input).map((candidate) =>
    normalizeMovieName(candidate)
  )
  const movieTitle = normalizeMovieName(movie.title)
  const movieOriginalTitle = normalizeMovieName(movie.originalTitle)
  const inputDirector = normalizeDirectorName(input.directorText)
  const movieDirector = normalizeDirectorName(movie.directorText)
  const movieYear = getMovieReleaseYear(movie)

  let score = 0

  if (normalizedTitles.some((candidate) => candidate === movieTitle)) {
    score += 100
  } else if (
    movieOriginalTitle &&
    normalizedTitles.some((candidate) => candidate === movieOriginalTitle)
  ) {
    score += 95
  } else if (
    normalizedTitles.some(
      (candidate) =>
        (candidate && movieTitle.includes(candidate)) ||
        (candidate && candidate.includes(movieTitle)) ||
        (movieOriginalTitle && (movieOriginalTitle.includes(candidate) || candidate.includes(movieOriginalTitle)))
    )
  ) {
    score += 35
  }

  if (inputDirector && movieDirector) {
    if (directorMatches(input.directorText, movie.directorText)) {
      score += 40
    } else {
      score -= 20
    }
  }

  if (input.releaseYear && movieYear) {
    if (input.releaseYear === movieYear) {
      score += 25
    } else if (Math.abs(input.releaseYear - movieYear) === 1) {
      score += 10
    } else {
      score -= 20
    }
  }

  if (movie.tmdbId) {
    score += 5
  }

  if (movie.posterUrl) {
    score += 5
  }

  return score
}

function pickBestMovieMatch(
  movies: Movie[],
  input: MovieMatchInput,
  minScore: number
) {
  let bestMatch: Movie | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  movies.forEach((movie) => {
    if (!directorMatches(input.directorText, movie.directorText)) {
      return
    }

    if (!yearMatches(input.releaseYear, movie)) {
      return
    }

    const score = scoreMovieCandidate(movie, input)

    if (score > bestScore) {
      bestScore = score
      bestMatch = movie
    }
  })

  return bestScore >= minScore ? bestMatch : null
}

async function findMoviesByExactTitleCandidates(
  titleCandidates: string[],
  db: DbClient
) {
  const titleFilters = titleCandidates.flatMap((candidate) => [
    {
      title: {
        equals: candidate,
        mode: 'insensitive' as const,
      },
    },
    {
      originalTitle: {
        equals: candidate,
        mode: 'insensitive' as const,
      },
    },
  ])

  return db.movie.findMany({
    where: {
      OR: titleFilters,
    },
    orderBy: {
      id: 'asc',
    },
  })
}

async function findMoviesByLooseTitleCandidates(
  titleCandidates: string[],
  db: DbClient
) {
  const looseCandidates = titleCandidates.filter((candidate) => {
    const normalized = normalizeMovieName(candidate)
    return normalized.length >= 4 || candidate.includes(' ')
  })

  if (looseCandidates.length === 0) {
    return []
  }

  const titleFilters = looseCandidates.flatMap((candidate) => [
    {
      title: {
        contains: candidate,
        mode: 'insensitive' as const,
      },
    },
    {
      originalTitle: {
        contains: candidate,
        mode: 'insensitive' as const,
      },
    },
  ])

  return db.movie.findMany({
    where: {
      OR: titleFilters,
    },
    orderBy: {
      id: 'asc',
    },
    take: 25,
  })
}

export async function findLocalMovieByImportMatch(
  input: MovieMatchInput,
  db: DbClient = prisma
): Promise<Movie | null> {
  if (input.tmdbId) {
    const movie = await db.movie.findUnique({
      where: {
        tmdbId: input.tmdbId,
      },
    })

    if (movie) {
      return movie
    }
  }

  const imdbId = extractImdbIdFromUrl(input.imdbId) || input.imdbId?.toLowerCase() || null

  if (imdbId) {
    const movie = await db.movie.findFirst({
      where: {
        imdbUrl: {
          contains: imdbId,
          mode: 'insensitive',
        },
      },
    })

    if (movie) {
      return movie
    }
  }

  const doubanUrl = normalizeResourceUrl(input.doubanUrl)

  if (doubanUrl) {
    const movie = await db.movie.findFirst({
      where: {
        doubanUrl: {
          startsWith: doubanUrl,
          mode: 'insensitive',
        },
      },
    })

    if (movie) {
      return movie
    }
  }

  const letterboxdUrl = normalizeResourceUrl(input.letterboxdUrl)

  if (letterboxdUrl) {
    const movie = await db.movie.findFirst({
      where: {
        letterboxdUrl: {
          startsWith: letterboxdUrl,
          mode: 'insensitive',
        },
      },
    })

    if (movie) {
      return movie
    }
  }

  const titleCandidates = getTitleCandidates(input)

  if (titleCandidates.length === 0) {
    return null
  }

  const exactMatches = await findMoviesByExactTitleCandidates(titleCandidates, db)
  const exactBestMatch = pickBestMovieMatch(exactMatches, input, 90)

  if (exactBestMatch) {
    return exactBestMatch
  }

  const looseMatches = await findMoviesByLooseTitleCandidates(titleCandidates, db)
  return pickBestMovieMatch(looseMatches, input, 60)
}
