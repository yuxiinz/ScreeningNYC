'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type TheaterOption = {
  slug: string
  name: string
}

export default function TheaterFilter({
  theaters,
  selectedTheaters,
}: {
  theaters: TheaterOption[]
  selectedTheaters: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const selectedSet = useMemo(() => new Set(selectedTheaters), [selectedTheaters])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  function updateUrl(nextSelected: string[]) {
    const params = new URLSearchParams(searchParams.toString())

    if (nextSelected.length === 0) {
      params.delete('theaters')
    } else {
      params.set('theaters', nextSelected.join(','))
    }

    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  function toggleTheater(slug: string) {
    const next = new Set(selectedTheaters)

    if (next.has(slug)) {
      next.delete(slug)
    } else {
      next.add(slug)
    }

    updateUrl(Array.from(next))
  }

  function clearAll() {
    updateUrl([])
    setOpen(false)
  }

  const buttonLabel =
    selectedTheaters.length === 0
      ? 'THEATER: ALL'
      : selectedTheaters.length === 1
      ? `THEATER: ${
          theaters.find(t => t.slug === selectedTheaters[0])?.name.toUpperCase() ||
          selectedTheaters[0].toUpperCase()
        }`
      : `THEATER: ${selectedTheaters.length} SELECTED`

  return (
    <div ref={containerRef} className="relative mb-3">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="min-w-[220px] cursor-pointer rounded-panel border border-border-default bg-card-bg px-4 py-3 text-left text-[0.95rem] font-bold tracking-[0.5px] text-text-primary transition-colors hover:border-border-strong"
      >
        {buttonLabel} ▼
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-30 max-h-[360px] w-80 overflow-y-auto rounded-card border border-border-default bg-card-bg p-2.5 shadow-dropdown">
          <div className="mb-2.5 flex items-center justify-between border-b border-border-default pb-2.5">
            <span className="text-[0.85rem] tracking-[0.5px] text-text-muted">
              FILTER THEATERS
            </span>

            <button
              type="button"
              onClick={clearAll}
              className="cursor-pointer border-none bg-transparent text-[0.8rem] text-text-dim transition-colors hover:text-text-primary"
            >
              ALL
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {theaters.map(theater => {
              const checked = selectedSet.has(theater.slug)

              return (
                <label
                  key={theater.slug}
                  className={[
                    'flex cursor-pointer items-center gap-2.5 rounded-panel px-2.5 py-2 transition-colors hover:bg-panel-bg',
                    checked ? 'bg-panel-bg' : 'bg-transparent',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTheater(theater.slug)}
                    className="cursor-pointer accent-white"
                  />
                  <span className="text-[0.92rem] text-text-primary">
                    {theater.name}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
