import { createTmdbResolveRoute } from '@/lib/api/tmdb-resolve-route'
import {
  resolveMovieFromTmdbId,
  TmdbMovieNotFoundError,
} from '@/lib/movie/resolve'

export const POST = createTmdbResolveRoute({
  resolveEntity: resolveMovieFromTmdbId,
  buildSuccessBody: (movie) => ({
    ok: true,
    movieId: movie.id,
    title: movie.title,
  }),
  customErrors: [
    {
      code: 'TMDB_MOVIE_NOT_FOUND',
      errorType: TmdbMovieNotFoundError,
      status: 404,
    },
  ],
  internalErrorMessage: 'Could not resolve movie right now.',
  logLabel: '[api][me][movies][resolve][POST]',
})
