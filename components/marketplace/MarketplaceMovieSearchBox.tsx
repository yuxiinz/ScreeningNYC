'use client'

import { useRouter } from 'next/navigation'

import SearchBoxShell from '@/components/search/SearchBoxShell'
import SearchResultButton from '@/components/search/SearchResultButton'
import useEntitySearch from '@/components/search/useEntitySearch'
import {
  getEmptyClientEntitySearchResults,
  searchClientEntityRoute,
} from '@/lib/api/client-search'
import type { MovieSearchResult } from '@/lib/movie/search-types'
import type { MarketplacePostTypeValue } from '@/lib/marketplace/shared'

type MarketplaceMovieSearchBoxProps = {
  selectedType: MarketplacePostTypeValue
}

async function searchMarketplaceMovies(query: string) {
  return searchClientEntityRoute<MovieSearchResult, never, MovieSearchResult>({
    authenticatedEndpoint: '/api/movies/search',
    errorMessage: 'Could not search movies right now.',
    invalidPayloadLabel: '[api][movies][search]',
    isAuthenticated: false,
    publicEndpoint: '/api/movies/search',
    query,
    transformPublicResults: (results) => results,
  })
}

function getEmptyResults() {
  return getEmptyClientEntitySearchResults<MovieSearchResult, never>()
}

export default function MarketplaceMovieSearchBox({
  selectedType,
}: MarketplaceMovieSearchBoxProps) {
  const router = useRouter()
  const {
    clearAndClose,
    error,
    hasAnyResults,
    loading,
    open,
    openIfReady,
    query,
    results,
    setQuery,
    wrapperRef,
  } = useEntitySearch<MovieSearchResult, never>({
    getEmptyResults,
    search: searchMarketplaceMovies,
    searchErrorMessage: 'Could not search movies right now.',
  })

  return (
    <div>
      <SearchBoxShell
        emptyMessage="No matching local films found."
        error={error}
        hasAnyResults={hasAnyResults}
        loading={loading}
        onFocus={openIfReady}
        onQueryChange={setQuery}
        open={open}
        placeholder="Search a film with upcoming showtimes"
        query={query}
        wrapperRef={wrapperRef}
      >
        {results.localResults.map((movie, index) => {
          const hasUpcomingShowtimes = movie.status === 'NOW_SHOWING'

          return (
            <SearchResultButton
              key={movie.id}
              isLast={index === results.localResults.length - 1}
              disabled={!hasUpcomingShowtimes}
              onClick={() => {
                if (!hasUpcomingShowtimes) {
                  return
                }

                clearAndClose()
                router.push(
                  `/market/new?type=${selectedType}&movieId=${movie.id}`
                )
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[0.9rem] font-semibold leading-[1.4]">
                    {movie.title}
                  </div>
                  <div className="text-[0.78rem] text-text-muted">
                    {movie.year ?? 'Year unknown'}
                  </div>
                </div>

                <span className="rounded-panel border border-border-input px-2 py-1 text-[0.68rem] font-semibold tracking-[0.08em] text-text-dim">
                  {hasUpcomingShowtimes ? 'SHOWTIMES' : 'NO SHOWTIMES'}
                </span>
              </div>
            </SearchResultButton>
          )
        })}
      </SearchBoxShell>
    </div>
  )
}
