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
  DirectorSearchResult,
  MeDirectorSearchExternalResult,
} from '@/lib/people/search-types'

type DirectorSearchBoxProps = {
  isAuthenticated?: boolean
}

type SearchResultsState = ClientEntitySearchResults<
  DirectorSearchResult,
  MeDirectorSearchExternalResult
>

function getFilmCountLabel(filmCount: number) {
  return `${filmCount} film${filmCount === 1 ? '' : 's'} in database`
}

async function searchDirectors(
  query: string,
  isAuthenticated: boolean
): Promise<SearchResultsState> {
  return searchClientEntityRoute({
    authenticatedEndpoint: '/api/me/people/search',
    errorMessage: 'Could not search directors right now.',
    invalidPayloadLabel: 'Director search API',
    isAuthenticated,
    publicEndpoint: '/api/people/search',
    query,
    transformPublicResults: (people: DirectorSearchResult[]) => people,
  })
}

function getEmptyResults(): SearchResultsState {
  return getEmptyClientEntitySearchResults()
}

export default function DirectorSearchBox({
  isAuthenticated = false,
}: DirectorSearchBoxProps) {
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
  } = useEntitySearch<DirectorSearchResult, MeDirectorSearchExternalResult>({
    getEmptyResults,
    getExternalKey: (person) => person.tmdbId,
    isAuthenticated,
    resolveErrorMessage: 'Could not create a director page right now.',
    resolveExternal: async (person) => {
      const personId = await resolveClientEntityRoute({
        body: {
          tmdbId: person.tmdbId,
        },
        endpoint: '/api/me/people/resolve',
        errorMessage: 'Could not create a director page right now.',
        idKey: 'personId',
        invalidPayloadErrorMessage:
          'Resolved director did not return a person id.',
      })

      router.push(`/people/${personId}`)
    },
    search: searchDirectors,
    searchErrorMessage: 'Could not search directors right now.',
  })

  return (
    <SearchBoxShell
      wrapperRef={wrapperRef}
      query={query}
      onQueryChange={setQuery}
      onFocus={openIfReady}
      placeholder="Search all directors"
      open={open}
      loading={loading}
      error={error}
      hasAnyResults={hasAnyResults}
      emptyMessage={
        isAuthenticated
          ? 'No directors found in Screening NYC or TMDB.'
          : 'No directors found'
      }
    >
      {!loading &&
        results.localResults.map((person, index) => (
          <SearchResultButton
            key={person.id}
            onClick={() => {
              clearAndClose()
              router.push(`/people/${person.id}`)
            }}
            isLast={
              index === results.localResults.length - 1 &&
              results.externalResults.length === 0
            }
          >
            <div className="text-[0.92rem] font-medium leading-[1.3]">
              {person.name}
            </div>
            <div className="mt-1 text-[0.78rem] text-text-muted">
              {getFilmCountLabel(person.filmCount)}
            </div>
          </SearchResultButton>
        ))}

      {!loading &&
        results.externalResults.map((person, index) => {
          const isPending = pendingResolveKey === person.tmdbId
          const isLast = index === results.externalResults.length - 1

          return (
            <SearchResultButton
              key={`tmdb-${person.tmdbId}`}
              disabled={pendingResolveKey !== null}
              onClick={() => {
                if (pendingResolveKey === null) {
                  void handleExternalSelect(person)
                }
              }}
              disabledClassName="disabled:cursor-wait disabled:opacity-70"
              isLast={isLast}
            >
              <div className="text-[0.92rem] font-medium leading-[1.3]">
                {person.name}
              </div>
              <div className="mt-1 text-[0.78rem] text-text-muted">
                {isPending ? 'Adding director...' : 'TMDB director'}
              </div>
            </SearchResultButton>
          )
        })}
    </SearchBoxShell>
  )
}
