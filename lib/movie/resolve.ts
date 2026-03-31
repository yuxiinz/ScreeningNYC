import axios from 'axios'

import { upsertMovie } from '@/lib/ingest/services/persist_service'
import type { TmdbMovie } from '@/lib/ingest/services/tmdb_service'
import { mapTmdbMovieCreditsToPeople } from '@/lib/people/tmdb'
import {
  buildTmdbImageUrl,
  getTmdbApiKey,
  TmdbApiKeyMissingError,
} from '@/lib/tmdb/client'

type TmdbSearchMovieResult = {
  id: number
  title?: string
  release_date?: string
  poster_path?: string | null
}

type TmdbSearchMovieResponse = {
  results?: TmdbSearchMovieResult[]
}

type TmdbMovieDetailResponse = {
  id: number
  title?: string
  original_title?: string
  release_date?: string
  runtime?: number
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  homepage?: string | null
  genres?: Array<{
    name?: string
  }>
}

type TmdbCreditsResponse = {
  crew?: Array<{
    id: number
    job?: string
    name?: string
    gender?: number | null
    order?: number
  }>
  cast?: Array<{
    id: number
    name?: string
    gender?: number | null
    order?: number
  }>
}

type TmdbExternalIdsResponse = {
  imdb_id?: string | null
}

export type TmdbCandidate = {
  source: 'TMDB'
  tmdbId: number
  title: string
  year?: number | null
  posterUrl?: string | null
}

export { TmdbApiKeyMissingError }

export class TmdbMovieNotFoundError extends Error {
  constructor(message = 'TMDB movie not found.') {
    super(message)
    this.name = 'TmdbMovieNotFoundError'
  }
}

function buildPosterUrl(path?: string | null) {
  return buildTmdbImageUrl(path, 'w500')
}

function buildBackdropUrl(path?: string | null) {
  return buildTmdbImageUrl(path, 'w780') || undefined
}

export async function searchTmdbCandidates(
  query: string,
  { take = 6 }: { take?: number } = {}
): Promise<TmdbCandidate[]> {
  const trimmedQuery = query.trim()

  if (trimmedQuery.length < 2) {
    return []
  }

  const apiKey = getTmdbApiKey()

  const response = await axios.get<TmdbSearchMovieResponse>(
    'https://api.themoviedb.org/3/search/movie',
    {
      timeout: 20000,
      params: {
        api_key: apiKey,
        query: trimmedQuery,
        include_adult: false,
      },
    }
  )

  const results = response.data?.results || []

  return results
    .filter((candidate) => candidate.id && candidate.title)
    .slice(0, take)
    .map((candidate) => ({
      source: 'TMDB' as const,
      tmdbId: candidate.id,
      title: candidate.title || 'Untitled',
      year: candidate.release_date
        ? Number(candidate.release_date.slice(0, 4)) || null
        : null,
      posterUrl: buildPosterUrl(candidate.poster_path),
    }))
}

async function fetchTmdbMovieById(tmdbId: number): Promise<TmdbMovie> {
  const apiKey = getTmdbApiKey()

  try {
    const [detailResponse, creditsResponse, externalIdsResponse] = await Promise.all([
      axios.get<TmdbMovieDetailResponse>(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
        timeout: 20000,
        params: {
          api_key: apiKey,
        },
      }),
      axios.get<TmdbCreditsResponse>(`https://api.themoviedb.org/3/movie/${tmdbId}/credits`, {
        timeout: 20000,
        params: {
          api_key: apiKey,
        },
      }),
      axios.get<TmdbExternalIdsResponse>(
        `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids`,
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
    const externalIds = externalIdsResponse.data

    const directors = (credits.crew || [])
      .filter((person) => person.job === 'Director')
      .slice(0, 3)
      .map((person) => person.name)
      .filter(Boolean)
      .join(', ')

    const cast = (credits.cast || [])
      .slice(0, 8)
      .map((person) => person.name)
      .filter(Boolean)
      .join(', ')

    const genres = (detail.genres || [])
      .map((genre) => genre.name)
      .filter(Boolean)
      .join(', ')

    return {
      tmdbId: detail.id,
      title: detail.title || 'Untitled',
      originalTitle: detail.original_title || undefined,
      releaseDate: detail.release_date ? new Date(detail.release_date) : undefined,
      runtimeMinutes: detail.runtime || undefined,
      overview: detail.overview || undefined,
      posterUrl: buildPosterUrl(detail.poster_path) || undefined,
      backdropUrl: buildBackdropUrl(detail.backdrop_path),
      imdbUrl: externalIds.imdb_id
        ? `https://www.imdb.com/title/${externalIds.imdb_id}`
        : undefined,
      officialSiteUrl: detail.homepage || undefined,
      genresText: genres || undefined,
      directorText: directors || undefined,
      castText: cast || undefined,
      peopleCredits: mapTmdbMovieCreditsToPeople(credits),
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new TmdbMovieNotFoundError()
    }

    throw error
  }
}

export async function resolveMovieFromTmdbId(tmdbId: number) {
  const tmdbMovie = await fetchTmdbMovieById(tmdbId)
  return upsertMovie(tmdbMovie)
}
