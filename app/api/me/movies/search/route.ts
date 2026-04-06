import {
  handleAuthenticatedSearchRoute,
  searchExternalResults,
} from '@/lib/api/search-route'
import type {
  MeMovieSearchLocalResult,
  MeMovieSearchResponse,
} from '@/lib/movie/search-types'
import { searchLocalMovies } from '@/lib/movie/search-service'
import {
  searchTmdbCandidates,
} from '@/lib/movie/resolve'
import { getMovieStatesForUser } from '@/lib/user-movies/service'

export async function GET(request: Request) {
  const emptyResponse: MeMovieSearchResponse = {
    localResults: [],
    externalResults: [],
  }

  return handleAuthenticatedSearchRoute({
    request,
    emptyResponse,
    internalErrorMessage: 'Could not search movies right now.',
    logLabel: '[api][me][movies][search][GET]',
    run: async (query, userId) => {
      const localSearchResults = await searchLocalMovies(query)
      const movieStates = await getMovieStatesForUser(
        userId,
        localSearchResults.map((movie) => movie.id)
      )

      const localResults: MeMovieSearchLocalResult[] = localSearchResults.map(
        (movie) => {
          const movieState = movieStates.get(movie.id) || {
            inWant: false,
            inWatched: false,
          }

          return {
            id: movie.id,
            title: movie.title,
            year: movie.year,
            status: movie.status,
            inWant: movieState.inWant,
            inWatched: movieState.inWatched,
          }
        }
      )

      const externalResults = await searchExternalResults({
        query,
        localResults: localSearchResults,
        getLocalTmdbId: (movie) => movie.tmdbId,
        searchExternal: searchTmdbCandidates,
        getExternalTmdbId: (candidate) => candidate.tmdbId,
      })

      return {
        localResults,
        externalResults,
      }
    },
  })
}
