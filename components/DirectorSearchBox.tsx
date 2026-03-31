'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import type {
  DirectorSearchResult,
  MeDirectorSearchExternalResult,
  MeDirectorSearchResponse,
} from '@/lib/people/search'

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

export default function DirectorSearchBox({
  isAuthenticated = false,
}: DirectorSearchBoxProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultsState>(getEmptyResults)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [pendingResolveTmdbId, setPendingResolveTmdbId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const router = useRouter()
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < 2) {
      setResults(getEmptyResults())
      setLoading(false)
      setOpen(false)
      setError('')
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')

      try {
        const endpoint = isAuthenticated
          ? `/api/me/people/search?q=${encodeURIComponent(trimmed)}`
          : `/api/people/search?q=${encodeURIComponent(trimmed)}`
        const response = await fetch(endpoint)

        if (!response.ok) {
          const text = await response.text()
          console.error('Director search API returned non OK response:', text)
          setResults(getEmptyResults())
          setError('Could not search directors right now.')
          setOpen(true)
          return
        }

        const data = await response.json()

        if (isAuthenticated) {
          const authenticatedResults = data as Partial<MeDirectorSearchResponse>

          if (
            Array.isArray(authenticatedResults.localResults) &&
            Array.isArray(authenticatedResults.externalResults)
          ) {
            setResults({
              localResults: authenticatedResults.localResults,
              externalResults: authenticatedResults.externalResults,
            })
          } else {
            console.error('Authenticated director search returned invalid payload:', data)
            setResults(getEmptyResults())
          }
        } else if (Array.isArray(data)) {
          setResults({
            localResults: data,
            externalResults: [],
          })
        } else {
          console.error('Director search API did not return an array:', data)
          setResults(getEmptyResults())
        }

        setOpen(true)
      } catch (nextError) {
        console.error('Director search request failed:', nextError)
        setResults(getEmptyResults())
        setError('Could not search directors right now.')
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [isAuthenticated, query])

  function handleSelect(personId: number) {
    setOpen(false)
    setQuery('')
    setError('')
    router.push(`/people/${personId}`)
  }

  async function handleExternalSelect(person: MeDirectorSearchExternalResult) {
    setPendingResolveTmdbId(person.tmdbId)
    setError('')

    try {
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

      setOpen(false)
      setQuery('')
      router.push(`/people/${data.personId}`)
    } catch (nextError) {
      console.error('Director resolve request failed:', nextError)
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not create a director page right now.'
      )
      setOpen(true)
    } finally {
      setPendingResolveTmdbId(null)
    }
  }

  const hasAnyResults =
    results.localResults.length > 0 || results.externalResults.length > 0

  return (
    <div ref={wrapperRef} className="relative w-80">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (query.trim().length >= 2) {
            setOpen(true)
          }
        }}
        placeholder="Search all directors"
        className="box-border w-full rounded-[4px] border border-border-input bg-page-bg px-[14px] py-2.5 text-[0.95rem] text-text-primary outline-none placeholder:text-text-dim"
      />

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[1000] max-h-[360px] w-full overflow-y-auto rounded-panel border border-border-strong bg-page-bg shadow-popover">
          {loading && (
            <div className="px-[14px] py-3 text-[0.9rem] text-text-muted">
              Searching...
            </div>
          )}

          {!loading && error && (
            <div className="px-[14px] py-3 text-[0.9rem] text-[#ffb3b3]">
              {error}
            </div>
          )}

          {!loading && !error && !hasAnyResults && (
            <div className="px-[14px] py-3 text-[0.9rem] text-text-disabled">
              {isAuthenticated
                ? 'No directors found in Screening NYC or TMDB.'
                : 'No directors found'}
            </div>
          )}

          {!loading &&
            results.localResults.map((person, index) => (
              <button
                key={person.id}
                type="button"
                onClick={() => handleSelect(person.id)}
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
              const isPending = pendingResolveTmdbId === person.tmdbId
              const isLast = index === results.externalResults.length - 1

              return (
                <button
                  key={`tmdb-${person.tmdbId}`}
                  type="button"
                  disabled={isPending}
                  onClick={() => void handleExternalSelect(person)}
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
        </div>
      )}
    </div>
  )
}
