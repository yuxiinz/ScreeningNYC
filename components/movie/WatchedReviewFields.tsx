'use client'

import RatingChain from '@/components/movie/RatingChain'

type WatchedReviewFieldsProps = {
  error?: string
  notice?: string
  pending: boolean
  rating: number | null
  rows?: number
  reviewText: string
  reviewTooLong: boolean
  reviewWordCount: number
  textareaClassName?: string
  onRatingChange: (nextRating: number | null) => void
  onReviewTextChange: (nextReviewText: string) => void
}

export default function WatchedReviewFields({
  error,
  notice,
  pending,
  rating,
  rows = 5,
  reviewText,
  reviewTooLong,
  reviewWordCount,
  textareaClassName = 'bg-page-bg',
  onRatingChange,
  onReviewTextChange,
}: WatchedReviewFieldsProps) {
  return (
    <>
      <div className="mb-6">
        <p className="mb-3 text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
          RATING
        </p>
        <RatingChain
          value={rating}
          onChange={onRatingChange}
          disabled={pending}
        />
      </div>

      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="m-0 text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
            SHORT REVIEW
          </p>
          <p
            className={[
              'm-0 text-[0.78rem]',
              reviewTooLong ? 'text-status-error' : 'text-text-dim',
            ].join(' ')}
          >
            {reviewWordCount}/200 words
          </p>
        </div>

        <textarea
          value={reviewText}
          onChange={(event) => onReviewTextChange(event.target.value)}
          rows={rows}
          placeholder="Optional. Keep it short."
          disabled={pending}
          className={[
            'w-full rounded-panel border border-border-input px-4 py-3 text-[0.92rem] leading-[1.6] text-text-primary outline-none placeholder:text-text-dim disabled:cursor-not-allowed disabled:opacity-60',
            textareaClassName,
          ].join(' ')}
        />
      </div>

      {(error || notice) ? (
        <p
          className={[
            'mb-6 text-[0.82rem] leading-[1.6]',
            error ? 'text-status-error' : 'text-accent-positive',
          ].join(' ')}
        >
          {error || notice}
        </p>
      ) : null}
    </>
  )
}
