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

    router.push(`${pathname}?${params.toString()}`)
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
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        marginBottom: '30px',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        style={{
          backgroundColor: '#111',
          color: '#fff',
          border: '1px solid #222',
          borderRadius: '6px',
          padding: '12px 16px',
          fontSize: '0.95rem',
          fontWeight: 700,
          letterSpacing: '0.5px',
          cursor: 'pointer',
          minWidth: '220px',
          textAlign: 'left',
        }}
      >
        {buttonLabel} ▼
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 30,
            width: '320px',
            maxHeight: '360px',
            overflowY: 'auto',
            backgroundColor: '#111',
            border: '1px solid #222',
            borderRadius: '8px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
            padding: '10px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
              paddingBottom: '10px',
              borderBottom: '1px solid #222',
            }}
          >
            <span
              style={{
                fontSize: '0.85rem',
                color: '#aaa',
                letterSpacing: '0.5px',
              }}
            >
              FILTER THEATERS
            </span>

            <button
              type="button"
              onClick={clearAll}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              ALL
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {theaters.map(theater => {
              const checked = selectedSet.has(theater.slug)

              return (
                <label
                  key={theater.slug}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: checked ? '#1a1a1a' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTheater(theater.slug)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span
                    style={{
                      color: '#fff',
                      fontSize: '0.92rem',
                    }}
                  >
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