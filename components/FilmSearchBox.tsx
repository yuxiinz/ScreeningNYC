// components/FilmSearchBox.tsx

'use client'

import { useRouter } from 'next/navigation'

import EntitySearchBox from '@/components/search/EntitySearchBox'
import {
  createTmdbClientEntityRoutes,
} from '@/lib/api/client-search'
import type {
  MeMovieSearchExternalResult,
  MeMovieSearchLocalResult,
  MovieSearchResult,
} from '@/lib/movie/search-types'

type FilmSearchBoxProps = {
  isAuthenticated?: boolean
}

const movieRoutes = createTmdbClientEntityRoutes<
  MeMovieSearchLocalResult,
  MeMovieSearchExternalResult,
  MovieSearchResult,
  'movieId'
>({
  resolve: {
    endpoint: '/api/me/movies/resolve',
    errorMessage: 'Could not create a film page right now.',
    idKey: 'movieId',
    invalidPayloadErrorMessage: 'Resolved film did not return a movie id.',
  },
  search: {
    authenticatedEndpoint: '/api/me/movies/search',
    errorMessage: 'Could not search films right now.',
    invalidPayloadLabel: 'Movie search API',
    publicEndpoint: '/api/movies/search',
    transformPublicResults: (movies) =>
      movies.map((movie) => ({
        ...movie,
        inWant: false,
        inWatched: false,
      })),
  },
})

function getStatusLabel(status: MovieSearchResult['status']) {
  if (status === 'NOW_SHOWING') return 'Now showing'
  return 'No current showtimes'
}

function getLocalMeta(movie: MeMovieSearchLocalResult) {
  const parts = [getStatusLabel(movie.status)]

  if (movie.inWant) {
    parts.push('In want list')
  }

  if (movie.inWatched) {
    parts.push('Watched')
  }

  return parts.join(' · ')
}

export default function FilmSearchBox({
  isAuthenticated = false,
}: FilmSearchBoxProps) {
  const router = useRouter()

  return (
    <EntitySearchBox<MeMovieSearchLocalResult, MeMovieSearchExternalResult>
      emptyMessage={
        isAuthenticated
          ? 'No films found in Screening NYC or TMDB.'
          : 'No films found'
      }
      getExternalKey={(movie) => movie.tmdbId}
      getLocalKey={(movie) => movie.id}
      isAuthenticated={isAuthenticated}
      onLocalSelect={(movie) => {
        router.push(`/films/${movie.id}`)
      }}
      placeholder="Search all films, including not now showing"
      renderLocalResult={(movie) => (
        <>
          <div className="mb-1 text-[0.95rem] leading-[1.3]">
            {movie.title}
            {movie.year ? ` (${movie.year})` : ''}
          </div>

          <div className="text-[0.8rem] leading-[1.2] text-text-dim">
            {getLocalMeta(movie)}
          </div>
        </>
      )}
      renderExternalResult={(movie, isPending) => (
        <>
          <div className="mb-1 flex items-center justify-between gap-3 text-[0.95rem] leading-[1.3]">
            <span>
              {movie.title}
              {movie.year ? ` (${movie.year})` : ''}
            </span>
            <span className="rounded-[4px] border border-border-input px-2 py-0.5 text-[0.68rem] font-semibold tracking-[0.08em] text-text-dim">
              TMDB
            </span>
          </div>

          <div className="text-[0.8rem] leading-[1.2] text-text-dim">
            {isPending ? 'Creating film page...' : 'Create film page and open details'}
          </div>
        </>
      )}
      resolveExternal={async (movie) => {
        const movieId = await movieRoutes.resolve(movie.tmdbId)

        router.push(`/films/${movieId}`)
      }}
      search={movieRoutes.search}
    />
  )
}
