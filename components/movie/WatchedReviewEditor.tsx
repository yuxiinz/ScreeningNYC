'use client'

import { useState } from 'react'

import RatingChain from '@/components/movie/RatingChain'
import { getReviewWordCount } from '@/lib/user-movies/review'

type WatchedReviewEditorProps = {
  movieId: number
  initialRating: number | null
  initialReviewText?: string | null
  className?: string
}

type MutationErrorPayload = {
  message?: string
  rating?: number | null
  reviewText?: string | null
}

async function getErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as MutationErrorPayload
    return payload.message || fallbackMessage
  } catch {
    return fallbackMessage
  }
}

function normalizeClientReviewText(reviewText: string) {
  return reviewText.trim()
}

export default function WatchedReviewEditor({
  movieId,
  initialRating,
  initialReviewText = '',
  className,
}: WatchedReviewEditorProps) {
  const initialReviewValue = initialReviewText || ''
  const initialNormalizedReview = normalizeClientReviewText(initialReviewValue)
  const [rating, setRating] = useState<number | null>(initialRating)
  const [reviewText, setReviewText] = useState(initialReviewValue)
  const [savedRating, setSavedRating] = useState<number | null>(initialRating)
  const [savedReviewText, setSavedReviewText] = useState(initialNormalizedReview)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const normalizedReviewText = normalizeClientReviewText(reviewText)
  const reviewWordCount = getReviewWordCount(reviewText)
  const reviewTooLong = reviewWordCount > 200
  const isDirty =
    rating !== savedRating || normalizedReviewText !== savedReviewText

  async function handleSave() {
    if (reviewTooLong) {
      setError('Review must be 200 words or fewer.')
      return
    }

    setPending(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch(`/api/me/movies/${movieId}/watched`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preserveWatchedAt: true,
          rating,
          reviewText: normalizedReviewText || null,
        }),
      })

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, 'Could not save rating and review.')
        )
      }

      setSavedRating(rating)
      setSavedReviewText(normalizedReviewText)
      setReviewText(normalizedReviewText)
      setNotice('Saved.')
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not save rating and review.'
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <section
      className={[
        'w-full rounded-panel border border-border-default bg-page-bg p-4',
        className || '',
      ].join(' ')}
    >
      <div className="mb-5">
        <p className="mb-3 text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
          RATING
        </p>
        <RatingChain
          value={rating}
          onChange={(nextRating) => {
            setRating(nextRating)
            setNotice('')
          }}
          disabled={pending}
        />
      </div>

      <div className="mb-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="m-0 text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
            SHORT REVIEW
          </p>
          <p
            className={[
              'm-0 text-[0.78rem]',
              reviewTooLong ? 'text-[#ffb3b3]' : 'text-text-dim',
            ].join(' ')}
          >
            {reviewWordCount}/200 words
          </p>
        </div>

        <textarea
          value={reviewText}
          onChange={(event) => {
            setReviewText(event.target.value)
            setNotice('')
          }}
          rows={7}
          placeholder="Optional. Keep it short."
          disabled={pending}
          className="w-full rounded-panel border border-border-input bg-card-bg px-4 py-3 text-[0.92rem] leading-[1.7] text-text-primary outline-none placeholder:text-text-dim disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {(error || notice) && (
        <p
          className={[
            'mb-4 text-[0.82rem] leading-[1.6]',
            error ? 'text-[#ffb3b3]' : 'text-accent-positive',
          ].join(' ')}
        >
          {error || notice}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            setRating(savedRating)
            setReviewText(savedReviewText)
            setError('')
            setNotice('')
          }}
          disabled={pending || !isDirty}
          className="rounded-panel border border-border-input px-4 py-3 text-[0.84rem] font-semibold text-text-secondary transition-colors hover:border-text-primary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={() => {
            if (!pending) {
              void handleSave()
            }
          }}
          disabled={pending || reviewTooLong || !isDirty}
          className="rounded-panel border border-accent-positive bg-accent-positive px-4 py-3 text-[0.84rem] font-bold text-page-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </section>
  )
}
