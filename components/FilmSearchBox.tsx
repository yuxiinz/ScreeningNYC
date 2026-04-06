// components/FilmSearchBox.tsx

'use client'

import { useRouter } from 'next/navigation'

import SearchBoxShell from '@/components/search/SearchBoxShell'
import useEntitySearch from '@/components/search/useEntitySearch'
import type {
  MeMovieSearchExternalResult,
  MeMovieSearchLocalResult,
  MeMovieSearchResponse,
  MovieSearchResult,
} from '@/lib/movie/search'

type FilmSearchBoxProps = {
  isAuthenticated?: boolean
}

type SearchResultsState = {
  localResults: MeMovieSearchLocalResult[]
  externalResults: MeMovieSearchExternalResult[]
}

function getEmptyResults(): SearchResultsState {
  return {
    localResults: [],
    externalResults: [],
  }
}

async function searchMovies(
  query: string,
  isAuthenticated: boolean
): Promise<SearchResultsState> {
  const endpoint = isAuthenticated
    ? `/api/me/movies/search?q=${encodeURIComponent(query)}`
    : `/api/movies/search?q=${encodeURIComponent(query)}`
  const response = await fetch(endpoint)

  if (!response.ok) {
    const text = await response.text()
    console.error('Search API returned non OK response:', text)
    throw new Error('Could not search films right now.')
  }

  const data = await response.json()

  if (isAuthenticated) {
    const authenticatedResults = data as Partial<MeMovieSearchResponse>

    if (
      Array.isArray(authenticatedResults.localResults) &&
      Array.isArray(authenticatedResults.externalResults)
    ) {
      return {
        localResults: authenticatedResults.localResults,
        externalResults: authenticatedResults.externalResults,
      }
    }

    console.error('Authenticated search API returned invalid payload:', data)

    return getEmptyResults()
  }

  if (Array.isArray(data)) {
    return {
      localResults: data.map((movie: MovieSearchResult) => ({
        ...movie,
        inWant: false,
        inWatched: false,
      })),
      externalResults: [],
    }
  }

  console.error('Search API did not return an array:', data)

  return getEmptyResults()
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
  } = useEntitySearch({
    getEmptyResults,
    getExternalKey: (movie) => movie.tmdbId,
    isAuthenticated,
    resolveErrorMessage: 'Could not create a film page right now.',
    resolveExternal: async (movie) => {
      const response = await fetch('/api/me/movies/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tmdbId: movie.tmdbId,
        }),
      })

      if (!response.ok) {
        throw new Error('Could not create a film page right now.')
      }

      const data = (await response.json()) as { movieId?: number }

      if (!data.movieId) {
        throw new Error('Resolved film did not return a movie id.')
      }

      router.push(`/films/${data.movieId}`)
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
          <button
            key={movie.id}
            type="button"
            onClick={() => {
              clearAndClose()
              router.push(`/films/${movie.id}`)
            }}
            className={[
              'w-full cursor-pointer bg-transparent px-[14px] py-3 text-left text-text-primary transition-colors hover:bg-card-bg',
              index === results.localResults.length - 1 &&
              results.externalResults.length === 0
                ? 'border-none'
                : 'border-b border-border-subtle',
            ].join(' ')}
          >
            <div className="mb-1 text-[0.95rem] leading-[1.3]">
              {movie.title}
              {movie.year ? ` (${movie.year})` : ''}
            </div>

            <div className="text-[0.8rem] leading-[1.2] text-text-dim">
              {getLocalMeta(movie)}
            </div>
          </button>
        ))}

      {!loading &&
        results.externalResults.map((movie, index) => (
          <button
            key={movie.tmdbId}
            type="button"
            onClick={() => {
              if (pendingResolveKey === null) {
                void handleExternalSelect(movie)
              }
            }}
            disabled={pendingResolveKey !== null}
            className={[
              'w-full cursor-pointer bg-transparent px-[14px] py-3 text-left text-text-primary transition-colors hover:bg-card-bg disabled:cursor-not-allowed disabled:opacity-60',
              index === results.externalResults.length - 1
                ? 'border-none'
                : 'border-b border-border-subtle',
            ].join(' ')}
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
          </button>
        ))}
    </SearchBoxShell>
  )
}
