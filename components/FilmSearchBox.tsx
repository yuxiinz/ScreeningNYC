// components/FilmSearchBox.tsx

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MovieSearchResult } from '@/lib/movie/search'

export default function FilmSearchBox() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MovieSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

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
      setResults([])
      setLoading(false)
      setOpen(false)
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)

      try {
        const res = await fetch(
          `/api/movies/search?q=${encodeURIComponent(trimmed)}`
        )

        if (!res.ok) {
          const text = await res.text()
          console.error('Search API returned non OK response:', text)
          setResults([])
          setOpen(true)
          return
        }

        const data = await res.json()

        if (Array.isArray(data)) {
          setResults(data)
        } else {
          console.error('Search API did not return an array:', data)
          setResults([])
        }

        setOpen(true)
      } catch (error) {
        console.error('Search request failed:', error)
        setResults([])
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  function handleSelect(movieId: number) {
    setOpen(false)
    setQuery('')
    router.push(`/films/${movieId}`)
  }

  function getStatusLabel(status: MovieSearchResult['status']) {
    if (status === 'NOW_SHOWING') return 'Now showing'
    return 'No current showtimes'
  }

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

          {!loading && results.length === 0 && (
            <div className="px-[14px] py-3 text-[0.9rem] text-text-disabled">
              No films found
            </div>
          )}

          {!loading &&
            results.map((movie, index) => (
              <button
                key={movie.id}
                type="button"
                onClick={() => handleSelect(movie.id)}
                className={[
                  'w-full cursor-pointer bg-transparent px-[14px] py-3 text-left text-text-primary transition-colors hover:bg-card-bg',
                  index === results.length - 1
                    ? 'border-none'
                    : 'border-b border-border-subtle',
                ].join(' ')}
              >
                <div className="mb-1 text-[0.95rem] leading-[1.3]">
                  {movie.title}
                  {movie.year ? ` (${movie.year})` : ''}
                </div>

                <div className="text-[0.8rem] leading-[1.2] text-text-dim">
                  {getStatusLabel(movie.status)}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
