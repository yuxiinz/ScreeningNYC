'use client'

import { useRouter } from 'next/navigation'

import EntitySearchBox from '@/components/search/EntitySearchBox'
import {
  createClientEntitySearch,
} from '@/lib/api/client-search'
import type { MovieSearchResult } from '@/lib/movie/search-types'
import type { MarketplacePostTypeValue } from '@/lib/marketplace/shared'

type MarketplaceMovieSearchBoxProps = {
  selectedType: MarketplacePostTypeValue
}

const searchMarketplaceMovies = createClientEntitySearch<
  MovieSearchResult,
  never,
  MovieSearchResult
>({
  authenticatedEndpoint: '/api/movies/search',
  errorMessage: 'Could not search movies right now.',
  invalidPayloadLabel: '[api][movies][search]',
  publicEndpoint: '/api/movies/search',
  transformPublicResults: (results) => results,
})

export default function MarketplaceMovieSearchBox({
  selectedType,
}: MarketplaceMovieSearchBoxProps) {
  const router = useRouter()

  return (
    <EntitySearchBox<MovieSearchResult, never>
      emptyMessage="No matching local films found."
      getLocalDisabled={(movie) => movie.status !== 'NOW_SHOWING'}
      getLocalKey={(movie) => movie.id}
      onLocalSelect={(movie) => {
        router.push(`/market/new?type=${selectedType}&movieId=${movie.id}`)
      }}
      placeholder="Search a film with upcoming showtimes"
      renderLocalResult={(movie) => {
        const hasUpcomingShowtimes = movie.status === 'NOW_SHOWING'

        return (
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
        )
      }}
      search={searchMarketplaceMovies}
    />
  )
}
