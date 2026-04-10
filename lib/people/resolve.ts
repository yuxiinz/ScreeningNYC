import axios from 'axios'

import { syncMovieDirectorsFromTmdbId } from '@/lib/movie/relations'
import { prisma } from '@/lib/prisma'
import {
  buildTmdbImageUrl,
  getTmdbApiKey,
  TmdbApiKeyMissingError,
} from '@/lib/tmdb/client'

type TmdbSearchPersonResult = {
  id: number
  name?: string
  known_for_department?: string | null
  profile_path?: string | null
  popularity?: number
}

type TmdbSearchPersonResponse = {
  results?: TmdbSearchPersonResult[]
}

type TmdbPersonDetailResponse = {
  id: number
  name?: string
  gender?: number | null
  known_for_department?: string | null
  profile_path?: string | null
}

type TmdbPersonMovieCredit = {
  id: number
  job?: string
}

type TmdbPersonMovieCreditsResponse = {
  crew?: TmdbPersonMovieCredit[]
}

export type TmdbDirectorCandidate = {
  source: 'TMDB'
  tmdbId: number
  name: string
  photoUrl?: string | null
}

export { TmdbApiKeyMissingError }

export class TmdbPersonNotFoundError extends Error {
  constructor(message = 'TMDB person not found.') {
    super(message)
    this.name = 'TmdbPersonNotFoundError'
  }
}

export class TmdbPersonNotDirectorError extends Error {
  constructor(message = 'TMDB person is not a director.') {
    super(message)
    this.name = 'TmdbPersonNotDirectorError'
  }
}

function hasDirectedMovies(credits: TmdbPersonMovieCreditsResponse) {
  return (credits.crew || []).some((credit) => credit.job === 'Director')
}

function getDirectedMovieTmdbIds(credits: TmdbPersonMovieCreditsResponse) {
  return [...new Set(
    (credits.crew || [])
      .filter((credit) => credit.job === 'Director' && credit.id)
      .map((credit) => credit.id)
  )]
}

function isDirectorCandidate(result: TmdbSearchPersonResult) {
  return Boolean(
    result.id &&
      result.name &&
      result.known_for_department === 'Directing'
  )
}

export async function searchTmdbDirectorCandidates(
  query: string,
  { take = 6 }: { take?: number } = {}
): Promise<TmdbDirectorCandidate[]> {
  const trimmedQuery = query.trim()

  if (trimmedQuery.length < 2) {
    return []
  }

  const apiKey = getTmdbApiKey()

  const response = await axios.get<TmdbSearchPersonResponse>(
    'https://api.themoviedb.org/3/search/person',
    {
      timeout: 20000,
      params: {
        api_key: apiKey,
        query: trimmedQuery,
        include_adult: false,
      },
    }
  )

  return (response.data.results || [])
    .filter(isDirectorCandidate)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, take)
    .map((person) => ({
      source: 'TMDB' as const,
      tmdbId: person.id,
      name: person.name || 'Unknown',
      photoUrl: buildTmdbImageUrl(person.profile_path, 'w500'),
    }))
}

async function fetchTmdbDirectorById(tmdbId: number) {
  const apiKey = getTmdbApiKey()

  try {
    const [detailResponse, creditsResponse] = await Promise.all([
      axios.get<TmdbPersonDetailResponse>(`https://api.themoviedb.org/3/person/${tmdbId}`, {
        timeout: 20000,
        params: {
          api_key: apiKey,
        },
      }),
      axios.get<TmdbPersonMovieCreditsResponse>(
        `https://api.themoviedb.org/3/person/${tmdbId}/movie_credits`,
        {
          timeout: 20000,
          params: {
            api_key: apiKey,
          },
        }
      ),
    ])

    const detail = detailResponse.data
    const credits = creditsResponse.data

    if (
      detail.known_for_department !== 'Directing' &&
      !hasDirectedMovies(credits)
    ) {
      throw new TmdbPersonNotDirectorError()
    }

    return {
      tmdbId: detail.id,
      name: detail.name || 'Unknown',
      gender: detail.gender ?? null,
      photoUrl: buildTmdbImageUrl(detail.profile_path, 'w500'),
      directedMovieTmdbIds: getDirectedMovieTmdbIds(credits),
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new TmdbPersonNotFoundError()
    }

    throw error
  }
}

export async function resolveDirectorFromTmdbId(tmdbId: number) {
  const director = await fetchTmdbDirectorById(tmdbId)
  const localMovieTmdbIds = director.directedMovieTmdbIds

  if (localMovieTmdbIds.length > 0) {
    const localMovies = await prisma.movie.findMany({
      where: {
        tmdbId: {
          in: localMovieTmdbIds,
        },
      },
      select: {
        id: true,
        tmdbId: true,
      },
    })

    for (const movie of localMovies) {
      if (!movie.tmdbId) continue
      await syncMovieDirectorsFromTmdbId(movie.id, movie.tmdbId)
    }
  }

  const existingPerson = await prisma.person.findUnique({
    where: {
      tmdbId: director.tmdbId,
    },
    select: {
      id: true,
    },
  })

  if (existingPerson) {
    await prisma.person.update({
      where: {
        id: existingPerson.id,
      },
      data: {
        name: director.name,
        gender: director.gender,
        ...(director.photoUrl ? { photoUrl: director.photoUrl } : {}),
      },
    })

    return prisma.person.findUniqueOrThrow({
      where: {
        id: existingPerson.id,
      },
    })
  }

  return prisma.person.create({
    data: {
      tmdbId: director.tmdbId,
      name: director.name,
      gender: director.gender,
      ...(director.photoUrl ? { photoUrl: director.photoUrl } : {}),
    },
  })
}
