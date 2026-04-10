'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import ShowtimeRow, { type ShowtimeRowItem } from '@/components/showtime/ShowtimeRow'
import type { MarketplacePostTypeValue } from '@/lib/marketplace/shared'

type MarketplaceShowtimeSelectorProps = {
  initialSelectedShowtimeIds: number[]
  movieId: number
  movieTitle: string
  selectedType: MarketplacePostTypeValue
  showtimes: ShowtimeRowItem[]
}

function buildSelectionHref(
  type: MarketplacePostTypeValue,
  movieId: number,
  showtimeIds: number[]
) {
  const params = new URLSearchParams({
    type,
    movieId: String(movieId),
  })

  if (showtimeIds.length > 0) {
    params.set('showtimeIds', showtimeIds.join(','))
  }

  return `/market/new?${params.toString()}`
}

export default function MarketplaceShowtimeSelector({
  initialSelectedShowtimeIds,
  movieId,
  movieTitle,
  selectedType,
  showtimes,
}: MarketplaceShowtimeSelectorProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<number[]>(initialSelectedShowtimeIds)

  useEffect(() => {
    setSelectedIds(initialSelectedShowtimeIds)
  }, [initialSelectedShowtimeIds])

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const sortedSelectedIds = useMemo(
    () =>
      showtimes
        .map((showtime) => showtime.id)
        .filter((showtimeId) => selectedIdSet.has(showtimeId)),
    [selectedIdSet, showtimes]
  )

  function shouldIgnoreToggle(target: EventTarget | null) {
    return (
      target instanceof HTMLElement &&
      Boolean(target.closest('a, button'))
    )
  }

  function toggleShowtime(showtimeId: number) {
    setSelectedIds((currentIds) =>
      currentIds.includes(showtimeId)
        ? currentIds.filter((id) => id !== showtimeId)
        : [...currentIds, showtimeId]
    )
  }

  function handleConfirmSelection() {
    if (sortedSelectedIds.length === 0) {
      return
    }

    router.replace(
      buildSelectionHref(selectedType, movieId, sortedSelectedIds),
      { scroll: false }
    )
  }

  return (
    <div className="space-y-4">
      {showtimes.map((showtime) => {
        const isSelected = selectedIdSet.has(showtime.id)

        return (
          <div
            key={showtime.id}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onClick={(event) => {
              if (shouldIgnoreToggle(event.target)) {
                return
              }

              toggleShowtime(showtime.id)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') {
                return
              }

              event.preventDefault()
              toggleShowtime(showtime.id)
            }}
            className={[
              'rounded-panel border p-3 transition-colors outline-none',
              isSelected
                ? 'border-text-primary bg-page-bg'
                : 'border-border-default bg-card-bg hover:border-border-input',
            ].join(' ')}
          >
            <ShowtimeRow movieTitle={movieTitle} showtime={showtime} />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 px-2 pb-1">
              <span className="text-[0.82rem] tracking-[0.08em] text-text-secondary">
                {isSelected ? 'SELECTED' : 'CLICK CARD TO SELECT'}
              </span>

              <span className="text-[0.78rem] tracking-[0.08em] text-text-dim">
                {isSelected
                  ? 'Included in this marketplace post.'
                  : 'Click anywhere on this showtime card to include it.'}
              </span>
            </div>
          </div>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-border-default bg-page-bg px-4 py-4">
        <div>
          <p className="m-0 text-[0.8rem] font-semibold tracking-[0.08em] text-text-secondary">
            {sortedSelectedIds.length} SHOWTIME
            {sortedSelectedIds.length === 1 ? '' : 'S'} SELECTED
          </p>
          <p className="mt-1 text-[0.82rem] leading-[1.6] text-text-dim">
            Choose one or more showtimes, then confirm to continue to the post
            form.
          </p>
        </div>

        <button
          type="button"
          onClick={handleConfirmSelection}
          disabled={sortedSelectedIds.length === 0}
          className="rounded-panel border border-text-primary bg-text-primary px-4 py-3 text-[0.8rem] font-semibold tracking-[0.08em] text-page-bg transition-colors disabled:cursor-not-allowed disabled:border-border-input disabled:bg-transparent disabled:text-text-disabled"
        >
          SELECT SHOWTIME
        </button>
      </div>
    </div>
  )
}
