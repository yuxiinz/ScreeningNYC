'use client'

import { useRouter } from 'next/navigation'

import SearchBoxShell from '@/components/search/SearchBoxShell'
import useEntitySearch from '@/components/search/useEntitySearch'
import type {
  DirectorSearchResult,
  MeDirectorSearchExternalResult,
  MeDirectorSearchResponse,
} from '@/lib/people/search-types'

type DirectorSearchBoxProps = {
  isAuthenticated?: boolean
}

type SearchResultsState = {
  localResults: DirectorSearchResult[]
  externalResults: MeDirectorSearchExternalResult[]
}

function getEmptyResults(): SearchResultsState {
  return {
    localResults: [],
    externalResults: [],
  }
}

function getFilmCountLabel(filmCount: number) {
  return `${filmCount} film${filmCount === 1 ? '' : 's'} in database`
}

async function searchDirectors(
  query: string,
  isAuthenticated: boolean
): Promise<SearchResultsState> {
  const endpoint = isAuthenticated
    ? `/api/me/people/search?q=${encodeURIComponent(query)}`
    : `/api/people/search?q=${encodeURIComponent(query)}`
  const response = await fetch(endpoint)

  if (!response.ok) {
    const text = await response.text()
    console.error('Director search API returned non OK response:', text)
    throw new Error('Could not search directors right now.')
  }

  const data = await response.json()

  if (isAuthenticated) {
    const authenticatedResults = data as Partial<MeDirectorSearchResponse>

    if (
      Array.isArray(authenticatedResults.localResults) &&
      Array.isArray(authenticatedResults.externalResults)
    ) {
      return {
        localResults: authenticatedResults.localResults,
        externalResults: authenticatedResults.externalResults,
      }
    }

    console.error('Authenticated director search returned invalid payload:', data)

    return getEmptyResults()
  }

  if (Array.isArray(data)) {
    return {
      localResults: data,
      externalResults: [],
    }
  }

  console.error('Director search API did not return an array:', data)

  return getEmptyResults()
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
  } = useEntitySearch({
    getEmptyResults,
    getExternalKey: (person) => person.tmdbId,
    isAuthenticated,
    resolveErrorMessage: 'Could not create a director page right now.',
    resolveExternal: async (person) => {
      const response = await fetch('/api/me/people/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tmdbId: person.tmdbId,
        }),
      })

      if (!response.ok) {
        throw new Error('Could not create a director page right now.')
      }

      const data = (await response.json()) as { personId?: number }

      if (!data.personId) {
        throw new Error('Resolved director did not return a person id.')
      }

      router.push(`/people/${data.personId}`)
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
          <button
            key={person.id}
            type="button"
            onClick={() => {
              clearAndClose()
              router.push(`/people/${person.id}`)
            }}
            className={[
              'w-full cursor-pointer bg-transparent px-[14px] py-3 text-left text-text-primary transition-colors hover:bg-card-bg',
              index === results.localResults.length - 1 &&
              results.externalResults.length === 0
                ? 'border-none'
                : 'border-0 border-b border-solid border-border-subtle',
            ].join(' ')}
          >
            <div className="text-[0.92rem] font-medium leading-[1.3]">
              {person.name}
            </div>
            <div className="mt-1 text-[0.78rem] text-text-muted">
              {getFilmCountLabel(person.filmCount)}
            </div>
          </button>
        ))}

      {!loading &&
        results.externalResults.map((person, index) => {
          const isPending = pendingResolveKey === person.tmdbId
          const isLast = index === results.externalResults.length - 1

          return (
            <button
              key={`tmdb-${person.tmdbId}`}
              type="button"
              disabled={pendingResolveKey !== null}
              onClick={() => {
                if (pendingResolveKey === null) {
                  void handleExternalSelect(person)
                }
              }}
              className={[
                'w-full cursor-pointer bg-transparent px-[14px] py-3 text-left text-text-primary transition-colors hover:bg-card-bg disabled:cursor-wait disabled:opacity-70',
                isLast ? 'border-none' : 'border-0 border-b border-solid border-border-subtle',
              ].join(' ')}
            >
              <div className="text-[0.92rem] font-medium leading-[1.3]">
                {person.name}
              </div>
              <div className="mt-1 text-[0.78rem] text-text-muted">
                {isPending ? 'Adding director...' : 'TMDB director'}
              </div>
            </button>
          )
        })}
    </SearchBoxShell>
  )
}
