// components/FilmSearchBox.tsx

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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

export default function FilmSearchBox({
  isAuthenticated = false,
}: FilmSearchBoxProps) {
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
          ? `/api/me/movies/search?q=${encodeURIComponent(trimmed)}`
          : `/api/movies/search?q=${encodeURIComponent(trimmed)}`
        const res = await fetch(endpoint)

        if (!res.ok) {
          const text = await res.text()
          console.error('Search API returned non OK response:', text)
          setResults(getEmptyResults())
          setError('Could not search films right now.')
          setOpen(true)
          return
        }

        const data = await res.json()

        if (isAuthenticated) {
          const authenticatedResults = data as Partial<MeMovieSearchResponse>

          if (
            Array.isArray(authenticatedResults.localResults) &&
            Array.isArray(authenticatedResults.externalResults)
          ) {
            setResults({
              localResults: authenticatedResults.localResults,
              externalResults: authenticatedResults.externalResults,
            })
          } else {
            console.error('Authenticated search API returned invalid payload:', data)
            setResults(getEmptyResults())
          }
        } else if (Array.isArray(data)) {
          setResults({
            localResults: data.map((movie: MovieSearchResult) => ({
              ...movie,
              inWant: false,
              inWatched: false,
            })),
            externalResults: [],
          })
        } else {
          console.error('Search API did not return an array:', data)
          setResults(getEmptyResults())
        }

        setOpen(true)
      } catch (error) {
        console.error('Search request failed:', error)
        setResults(getEmptyResults())
        setError('Could not search films right now.')
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [isAuthenticated, query])

  function handleSelect(movieId: number) {
    setOpen(false)
    setQuery('')
    setError('')
    router.push(`/films/${movieId}`)
  }

  async function handleExternalSelect(movie: MeMovieSearchExternalResult) {
    setPendingResolveTmdbId(movie.tmdbId)
    setError('')

    try {
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

      setOpen(false)
      setQuery('')
      router.push(`/films/${data.movieId}`)
    } catch (nextError) {
      console.error('Resolve request failed:', nextError)
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not create a film page right now.'
      )
      setOpen(true)
    } finally {
      setPendingResolveTmdbId(null)
    }
  }

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

  const hasAnyResults =
    results.localResults.length > 0 || results.externalResults.length > 0

  return (
    <div ref={wrapperRef} className="relative w-80">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (query.trim().length >= 2) {
            setOpen(true)
          }
        }}
        placeholder="Search all films, including not now showing"
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
                ? 'No films found in Screening NYC or TMDB.'
                : 'No films found'}
            </div>
          )}

          {!loading &&
            results.localResults.map((movie, index) => (
              <button
                key={movie.id}
                type="button"
                onClick={() => handleSelect(movie.id)}
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
                  if (pendingResolveTmdbId === null) {
                    void handleExternalSelect(movie)
                  }
                }}
                disabled={pendingResolveTmdbId !== null}
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
                  {pendingResolveTmdbId === movie.tmdbId
                    ? 'Creating film page...'
                    : 'Create film page and open details'}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
