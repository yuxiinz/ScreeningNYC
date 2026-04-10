'use client'

import { useState } from 'react'

import WatchedReviewFields from '@/components/movie/WatchedReviewFields'
import { getReviewWordCount } from '@/lib/user-movies/review'
import {
  normalizeClientReviewText,
  saveMovieWatchedEntry,
} from '@/lib/user-movies/client-watched'

type WatchedReviewEditorProps = {
  movieId: number
  initialRating: number | null
  initialReviewText?: string | null
  className?: string
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
      await saveMovieWatchedEntry({
        fallbackError: 'Could not save rating and review.',
        movieId,
        preserveWatchedAt: true,
        rating,
        reviewText: normalizedReviewText || null,
      })

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
      <WatchedReviewFields
        error={error}
        notice={notice}
        pending={pending}
        rating={rating}
        rows={7}
        reviewText={reviewText}
        reviewTooLong={reviewTooLong}
        reviewWordCount={reviewWordCount}
        textareaClassName="bg-card-bg leading-[1.7]"
        onRatingChange={(nextRating) => {
          setRating(nextRating)
          setNotice('')
        }}
        onReviewTextChange={(nextReviewText) => {
          setReviewText(nextReviewText)
          setNotice('')
        }}
      />

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
