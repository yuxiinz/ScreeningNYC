import { createSearchRoute } from '@/lib/api/search-route'
import { requireUserId } from '@/lib/auth/require-user-id'
import type { MeMovieSearchExternalResult, MeMovieSearchLocalResult } from '@/lib/movie/search-types'
import { searchLocalMovies } from '@/lib/movie/search-service'
import { searchTmdbCandidates } from '@/lib/movie/resolve'
import { getMovieStatesForUser } from '@/lib/user-movies/service'

export const GET = createSearchRoute({
  getUserId: requireUserId,
  external: {
    getExternalTmdbId: (candidate: MeMovieSearchExternalResult) => candidate.tmdbId,
    getLocalTmdbId: (movie) => movie.tmdbId,
    searchExternal: searchTmdbCandidates,
  },
  internalErrorMessage: 'Could not search movies right now.',
  logLabel: '[api][me][movies][search][GET]',
  mapLocalResults: async (localSearchResults, userId) => {
    const movieStates = await getMovieStatesForUser(
      userId,
      localSearchResults.map((movie) => movie.id)
    )

    return localSearchResults.map(
      (movie): MeMovieSearchLocalResult => {
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
  },
  searchLocal: searchLocalMovies,
})
