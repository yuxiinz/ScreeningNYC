import { createTmdbResolveRoute } from '@/lib/api/tmdb-resolve-route'
import {
  resolveMovieFromTmdbId,
  TmdbMovieNotFoundError,
} from '@/lib/movie/resolve'

export const POST = createTmdbResolveRoute({
  resolve: async (tmdbId) => {
    const movie = await resolveMovieFromTmdbId(tmdbId)

    return {
      ok: true,
      movieId: movie.id,
      title: movie.title,
    }
  },
  errors: [
    {
      code: 'TMDB_MOVIE_NOT_FOUND',
      status: 404,
      when: TmdbMovieNotFoundError,
    },
  ],
  internalErrorMessage: 'Could not resolve movie right now.',
  logLabel: '[api][me][movies][resolve][POST]',
})
