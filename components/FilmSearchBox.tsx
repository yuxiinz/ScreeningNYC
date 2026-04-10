// components/FilmSearchBox.tsx

'use client'

import { useRouter } from 'next/navigation'

import SearchBoxShell from '@/components/search/SearchBoxShell'
import SearchResultButton from '@/components/search/SearchResultButton'
import useEntitySearch from '@/components/search/useEntitySearch'
import {
  getEmptyClientEntitySearchResults,
  resolveClientEntityRoute,
  searchClientEntityRoute,
  type ClientEntitySearchResults,
} from '@/lib/api/client-search'
import type {
  MeMovieSearchExternalResult,
  MeMovieSearchLocalResult,
  MovieSearchResult,
} from '@/lib/movie/search-types'

type FilmSearchBoxProps = {
  isAuthenticated?: boolean
}

type SearchResultsState = ClientEntitySearchResults<
  MeMovieSearchLocalResult,
  MeMovieSearchExternalResult
>

async function searchMovies(
  query: string,
  isAuthenticated: boolean
): Promise<SearchResultsState> {
  return searchClientEntityRoute({
    authenticatedEndpoint: '/api/me/movies/search',
    errorMessage: 'Could not search films right now.',
    invalidPayloadLabel: 'Movie search API',
    isAuthenticated,
    publicEndpoint: '/api/movies/search',
    query,
    transformPublicResults: (movies: MovieSearchResult[]) =>
      movies.map((movie) => ({
        ...movie,
        inWant: false,
        inWatched: false,
      })),
  })
}

function getEmptyResults(): SearchResultsState {
  return getEmptyClientEntitySearchResults()
}

export default function FilmSearchBox({
  isAuthenticated = false,
}: FilmSearchBoxProps) {
  const router = useRouter()
  const {
    clearAndClose,
    error,
    handleExternalSelect,
    hasAnyResults,
    loading,
    open,
    openIfReady,
    pendingResolveKey,
    query,
    results,
    setQuery,
    wrapperRef,
  } = useEntitySearch<MeMovieSearchLocalResult, MeMovieSearchExternalResult>({
    getEmptyResults,
    getExternalKey: (movie) => movie.tmdbId,
    isAuthenticated,
    resolveErrorMessage: 'Could not create a film page right now.',
    resolveExternal: async (movie) => {
      const movieId = await resolveClientEntityRoute({
        body: {
          tmdbId: movie.tmdbId,
        },
        endpoint: '/api/me/movies/resolve',
        errorMessage: 'Could not create a film page right now.',
        idKey: 'movieId',
        invalidPayloadErrorMessage: 'Resolved film did not return a movie id.',
      })

      router.push(`/films/${movieId}`)
    },
    search: searchMovies,
    searchErrorMessage: 'Could not search films right now.',
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

  return (
    <SearchBoxShell
      wrapperRef={wrapperRef}
      query={query}
      onQueryChange={setQuery}
      onFocus={openIfReady}
      placeholder="Search all films, including not now showing"
      open={open}
      loading={loading}
      error={error}
      hasAnyResults={hasAnyResults}
      emptyMessage={
        isAuthenticated
          ? 'No films found in Screening NYC or TMDB.'
          : 'No films found'
      }
    >
      {!loading &&
        results.localResults.map((movie, index) => (
          <SearchResultButton
            key={movie.id}
            onClick={() => {
              clearAndClose()
              router.push(`/films/${movie.id}`)
            }}
            isLast={
              index === results.localResults.length - 1 &&
              results.externalResults.length === 0
            }
          >
            <div className="mb-1 text-[0.95rem] leading-[1.3]">
              {movie.title}
              {movie.year ? ` (${movie.year})` : ''}
            </div>

            <div className="text-[0.8rem] leading-[1.2] text-text-dim">
              {getLocalMeta(movie)}
            </div>
          </SearchResultButton>
        ))}

      {!loading &&
        results.externalResults.map((movie, index) => (
          <SearchResultButton
            key={movie.tmdbId}
            onClick={() => {
              if (pendingResolveKey === null) {
                void handleExternalSelect(movie)
              }
            }}
            disabled={pendingResolveKey !== null}
            isLast={index === results.externalResults.length - 1}
          >
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
              {pendingResolveKey === movie.tmdbId
                ? 'Creating film page...'
                : 'Create film page and open details'}
            </div>
          </SearchResultButton>
        ))}
    </SearchBoxShell>
  )
}
