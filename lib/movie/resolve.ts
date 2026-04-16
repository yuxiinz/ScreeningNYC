import type { Movie } from '@prisma/client'

import { fetchJson, isHttpError } from '@/lib/http/server-fetch'
import {
  mergeMovieImportLinks,
  type FallbackMovieData,
  upsertMovie,
} from '@/lib/ingest/services/persist_service'
import {
  searchTmdbMovie,
  type TmdbMovie,
  type TmdbSearchMovieResult,
  type TmdbSearchMovieResponse,
  type TmdbMovieDetailResponse,
  type TmdbCreditsResponse,
  type TmdbExternalIdsResponse,
} from '@/lib/ingest/services/tmdb_service'
import {
  extractImdbIdFromUrl,
  findLocalMovieByImportMatch,
} from '@/lib/movie/match'
import { shouldAttemptCanonicalTmdbLookup } from '@/lib/movie/canonical-lookup'
import { mapTmdbMovieCreditsToDirectors } from '@/lib/people/tmdb'
import {
  buildTmdbImageUrl,
  getTmdbApiKey,
  TmdbApiKeyMissingError,
} from '@/lib/tmdb/client'


export type TmdbCandidate = {
  source: 'TMDB'
  tmdbId: number
  title: string
  year?: number | null
  posterUrl?: string | null
}

export { TmdbApiKeyMissingError }

export type MovieImportResolveInput = {
  title: string
  titleCandidates?: string[]
  directorText?: string
  releaseYear?: number
  releaseDate?: Date
  posterUrl?: string
  tmdbId?: number
  imdbId?: string
  doubanUrl?: string
  letterboxdUrl?: string
  productionCountriesText?: string
}

export type MovieImportResolveResult = {
  movie: Movie | null
  matchedVia: 'tmdb_id' | 'imdb_id' | 'local_signature' | 'tmdb_search' | 'none'
}

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

  const response = await fetchJson<TmdbSearchMovieResponse>(
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

export async function fetchTmdbMovieById(tmdbId: number): Promise<TmdbMovie> {
  const apiKey = getTmdbApiKey()

  try {
    const [detailResponse, creditsResponse, externalIdsResponse] = await Promise.all([
      fetchJson<TmdbMovieDetailResponse>(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
        timeout: 20000,
        params: {
          api_key: apiKey,
        },
      }),
      fetchJson<TmdbCreditsResponse>(`https://api.themoviedb.org/3/movie/${tmdbId}/credits`, {
        timeout: 20000,
        params: {
          api_key: apiKey,
        },
      }),
      fetchJson<TmdbExternalIdsResponse>(
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
    const productionCountries = (detail.production_countries || [])
      .map((country) => country.name)
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
      productionCountriesText: productionCountries || undefined,
      directorText: directors || undefined,
      castText: cast || undefined,
      directorCredits: mapTmdbMovieCreditsToDirectors(credits),
    }
  } catch (error) {
    if (isHttpError(error) && error.status === 404) {
      throw new TmdbMovieNotFoundError()
    }

    throw error
  }
}

function buildFallbackFromImportInput(input: MovieImportResolveInput): FallbackMovieData {
  return {
    title: input.title,
    titleCandidates: input.titleCandidates,
    directorText: input.directorText,
    releaseYear: input.releaseYear,
    releaseDate: input.releaseDate,
    posterUrl: input.posterUrl,
    imdbUrl: input.imdbId ? `https://www.imdb.com/title/${input.imdbId}` : undefined,
    doubanUrl: input.doubanUrl,
    letterboxdUrl: input.letterboxdUrl,
    productionCountriesText: input.productionCountriesText,
  }
}

async function supplementImportMatchedMovie(
  movie: Movie,
  fallback: FallbackMovieData
) {
  return mergeMovieImportLinks(movie.id, {
    imdbUrl: fallback.imdbUrl,
    doubanUrl: fallback.doubanUrl,
    letterboxdUrl: fallback.letterboxdUrl,
  })
}

export async function resolveMovieFromTmdbId(
  tmdbId: number,
  fallback?: FallbackMovieData
) {
  const tmdbMovie = await fetchTmdbMovieById(tmdbId)
  return upsertMovie(tmdbMovie, fallback)
}

export async function resolveMovieFromImportInput(
  input: MovieImportResolveInput
): Promise<MovieImportResolveResult> {
  const fallback = buildFallbackFromImportInput(input)
  const normalizedInputImdbId =
    extractImdbIdFromUrl(input.imdbId) || input.imdbId?.toLowerCase() || null

  if (input.tmdbId) {
    const movie = await resolveMovieFromTmdbId(input.tmdbId, fallback)
    return {
      movie,
      matchedVia: 'tmdb_id',
    }
  }

  const localMovie = await findLocalMovieByImportMatch({
    title: input.title,
    titleCandidates: input.titleCandidates,
    directorText: input.directorText,
    releaseYear: input.releaseYear,
    imdbId: input.imdbId,
    doubanUrl: input.doubanUrl,
    letterboxdUrl: input.letterboxdUrl,
  })

  if (localMovie) {
    const localImdbId = extractImdbIdFromUrl(localMovie.imdbUrl)
    const matchedVia =
      normalizedInputImdbId && localImdbId === normalizedInputImdbId
        ? 'imdb_id'
        : 'local_signature'

    if (!shouldAttemptCanonicalTmdbLookup(localMovie, input)) {
      const supplementedMovie = await supplementImportMatchedMovie(localMovie, fallback)

      return {
        movie: supplementedMovie || localMovie,
        matchedVia,
      }
    }
  }

  let tmdbApiKey: string | undefined

  try {
    tmdbApiKey = getTmdbApiKey()
  } catch (error) {
    if (!(error instanceof TmdbApiKeyMissingError)) {
      throw error
    }
  }

  const tmdbMovie = await searchTmdbMovie({
    title: input.title,
    titleCandidates: input.titleCandidates,
    directorText: input.directorText,
    releaseYear: input.releaseYear,
    tmdbApiKey,
  })

  if (!tmdbMovie.tmdbId) {
    if (localMovie) {
      const supplementedMovie = await supplementImportMatchedMovie(localMovie, fallback)

      return {
        movie: supplementedMovie || localMovie,
        matchedVia:
          normalizedInputImdbId &&
          extractImdbIdFromUrl(localMovie.imdbUrl) === normalizedInputImdbId
            ? 'imdb_id'
            : 'local_signature',
      }
    }

    return {
      movie: null,
      matchedVia: 'none',
    }
  }

  return {
    movie: await upsertMovie(tmdbMovie, fallback),
    matchedVia: 'tmdb_search',
  }
}
