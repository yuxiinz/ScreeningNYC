'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { getErrorMessageFromResponse } from '@/lib/api/client-response'
import type { MarketplacePostTypeValue } from '@/lib/marketplace/shared'
import {
  formatDateKeyInAppTimezone,
  formatTimeInAppTimezone,
  getDateKeyInAppTimezone,
} from '@/lib/timezone'

const INPUT_CLASS =
  'w-full rounded-panel border border-border-input bg-page-bg px-4 py-3 text-[0.92rem] text-text-primary outline-none placeholder:text-text-dim'
const LABEL_CLASS =
  'mb-2 block text-[0.78rem] font-semibold tracking-[0.08em] text-text-secondary'

type MarketplacePostFormProps = {
  initialDisplayName: string
  requiresDisplayName: boolean
  movieId: number
  selectedShowtimeIds: number[]
  selectedShowtimes: Array<{
    id: number
    startTime: Date
    theater: {
      name: string
    }
  }>
  type: MarketplacePostTypeValue
  existingPost: {
    id: number
    status: 'ACTIVE' | 'COMPLETED' | 'CANCELED'
    quantity: number
    priceCents: number | null
    seatInfo: string | null
    contactSnapshot: string
  } | null
}

function formatPriceInput(priceCents?: number | null) {
  if (typeof priceCents !== 'number') {
    return ''
  }

  return (priceCents / 100).toFixed(2)
}

export default function MarketplacePostForm({
  initialDisplayName,
  requiresDisplayName,
  movieId,
  selectedShowtimeIds,
  selectedShowtimes,
  type,
  existingPost,
}: MarketplacePostFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [quantity, setQuantity] = useState(String(existingPost?.quantity ?? 1))
  const [price, setPrice] = useState(formatPriceInput(existingPost?.priceCents))
  const [seatInfo, setSeatInfo] = useState(existingPost?.seatInfo || '')
  const [contactSnapshot, setContactSnapshot] = useState(
    existingPost?.contactSnapshot || ''
  )
  const [error, setError] = useState('')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const quantityValue = Number.parseInt(quantity, 10)
    const parsedPriceCents =
      type === 'SELL' ? Math.round(Number.parseFloat(price) * 100) : 0

    if (!Number.isInteger(quantityValue) || quantityValue <= 0) {
      setError('Quantity must be a positive integer.')
      return
    }

    if (
      type === 'SELL' &&
      (!Number.isInteger(parsedPriceCents) || parsedPriceCents < 0)
    ) {
      setError('Price must be a valid amount.')
      return
    }

    const normalizedPriceCents = type === 'SELL' ? parsedPriceCents : null

    startTransition(async () => {
      try {
        const response = await fetch('/api/me/marketplace/posts/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type,
            showtimeIds: selectedShowtimeIds,
            quantity: quantityValue,
            priceCents: normalizedPriceCents,
            seatInfo: type === 'SELL' ? seatInfo : null,
            contactSnapshot,
            displayName: requiresDisplayName ? displayName : null,
          }),
        })

        if (!response.ok) {
          throw new Error(
            await getErrorMessageFromResponse(
              response,
              'Could not save marketplace post right now.'
            )
          )
        }

        router.push(`/market/films/${movieId}`)
        router.refresh()
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Could not save marketplace post right now.'
        )
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card"
    >
      <div className="mb-6">
        <h2 className="mb-1 text-[1.25rem] font-bold">
          {existingPost ? `EDIT ${type}` : `POST ${type}`}
        </h2>
        <p className="m-0 text-[0.88rem] leading-[1.6] text-text-secondary">
          {type === 'SELL'
            ? 'Enter the ticket count, price, optional seat note, and how other members should contact you.'
            : 'Enter the ticket count and how sellers should contact you.'}
        </p>
        {type === 'SELL' ? (
          <p className="mt-2 text-[0.78rem] leading-[1.6] text-text-dim">
            Suggested price: at or below the original ticket price.
          </p>
        ) : null}
        {existingPost && existingPost.status !== 'ACTIVE' ? (
          <p className="mt-2 text-[0.78rem] leading-[1.6] text-accent-positive">
            Saving this form will reactivate your previous post.
          </p>
        ) : null}
        <p className="mt-2 text-[0.78rem] leading-[1.6] text-text-dim">
          This will post to {selectedShowtimeIds.length} selected showtime
          {selectedShowtimeIds.length === 1 ? '' : 's'}.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {selectedShowtimes.map((showtime) => (
          <span
            key={showtime.id}
            className="rounded-panel border border-border-input bg-page-bg px-3 py-2 text-[0.76rem] tracking-[0.06em] text-text-secondary"
          >
            {formatDateKeyInAppTimezone(getDateKeyInAppTimezone(showtime.startTime))}
            {' · '}
            {formatTimeInAppTimezone(showtime.startTime)}
            {' · '}
            {showtime.theater.name}
          </span>
        ))}
      </div>

      <div className="space-y-5">
        {requiresDisplayName ? (
          <label className="block">
            <span className={LABEL_CLASS}>DISPLAY NAME</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Name shown on your marketplace card"
              className={INPUT_CLASS}
              disabled={isPending}
            />
          </label>
        ) : null}

        <label className="block">
          <span className={LABEL_CLASS}>TICKET COUNT</span>
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className={INPUT_CLASS}
            disabled={isPending}
          />
        </label>

        {type === 'SELL' ? (
          <>
            <label className="block">
              <span className={LABEL_CLASS}>PRICE (USD)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="18.00"
                className={INPUT_CLASS}
                disabled={isPending}
              />
            </label>

            <label className="block">
              <span className={LABEL_CLASS}>SEAT INFO (OPTIONAL)</span>
              <input
                type="text"
                value={seatInfo}
                onChange={(event) => setSeatInfo(event.target.value)}
                placeholder="Row G, Seat 8"
                className={INPUT_CLASS}
                disabled={isPending}
              />
            </label>
          </>
        ) : null}

        <label className="block">
          <span className={LABEL_CLASS}>CONTACT INFO</span>
          <textarea
            value={contactSnapshot}
            onChange={(event) => setContactSnapshot(event.target.value)}
            placeholder="Email, phone, Instagram, or another contact method"
            rows={4}
            className={INPUT_CLASS}
            disabled={isPending}
          />
        </label>
      </div>

      {error ? (
        <p className="mt-4 rounded-panel border border-status-error-border bg-status-error-bg px-4 py-3 text-[0.84rem] leading-[1.6] text-status-error">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-panel border border-text-primary bg-text-primary px-4 py-3 text-[0.8rem] font-semibold tracking-[0.08em] text-page-bg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'SAVING...' : existingPost ? 'SAVE CHANGES' : `POST ${type}`}
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={() => router.push(`/market/films/${movieId}`)}
          className="rounded-panel border border-border-input px-4 py-3 text-[0.8rem] font-semibold tracking-[0.08em] text-text-secondary transition-colors hover:border-text-primary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          BACK TO MARKET
        </button>
      </div>
    </form>
  )
}
