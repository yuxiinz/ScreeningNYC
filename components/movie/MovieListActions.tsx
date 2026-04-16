'use client'

import { useState } from 'react'

import {
  buildListActionButtonClass,
  toggleListAction,
} from '@/components/list-actions/shared'
import { useRefreshOnPath } from '@/components/list-actions/useRefreshOnPath'
import WatchedReviewFields from '@/components/movie/WatchedReviewFields'
import { getErrorMessageFromResponse } from '@/lib/api/client-response'
import { getReviewWordCount } from '@/lib/user-movies/review'
import {
  normalizeClientReviewText,
  saveMovieWatchedEntry,
} from '@/lib/user-movies/client-watched'

type MovieListActionsProps = {
  movieId: number
  initialInWant: boolean
  initialInWatched: boolean
  compact?: boolean
  className?: string
}

type PendingAction = 'want' | 'watched' | null

export default function MovieListActions({
  movieId,
  initialInWant,
  initialInWatched,
  compact = false,
  className,
}: MovieListActionsProps) {
  const refreshIfOnWantList = useRefreshOnPath('/me/want-list')
  const refreshIfOnWatched = useRefreshOnPath('/me/watched')
  const [inWant, setInWant] = useState(initialInWant)
  const [inWatched, setInWatched] = useState(initialInWatched)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [watchedDialogOpen, setWatchedDialogOpen] = useState(false)
  const [removeWantDialogOpen, setRemoveWantDialogOpen] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [reviewText, setReviewText] = useState('')
  const [error, setError] = useState('')
  const reviewWordCount = getReviewWordCount(reviewText)
  const reviewTooLong = reviewWordCount > 200

  async function handleWantToggle() {
    setPendingAction('want')
    setError('')

    try {
      const nextInWant = await toggleListAction({
        endpoint: `/api/me/movies/${movieId}/want`,
        fallbackError: 'Could not update want list.',
        isActive: inWant,
      })

      setInWant(nextInWant)

      if (inWant) {
        refreshIfOnWantList()
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not update want list.'
      )
    } finally {
      setPendingAction(null)
    }
  }

  async function handleWatchedToggle() {
    if (!inWatched) {
      setError('')
      setRating(null)
      setReviewText('')
      setWatchedDialogOpen(true)
      return
    }

    setError('')
    setPendingAction('watched')

    try {
      const response = await fetch(`/api/me/movies/${movieId}/watched`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(
          await getErrorMessageFromResponse(
            response,
            'Could not update watched list.'
          )
        )
      }

      setInWatched(false)

      refreshIfOnWatched()
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not update watched list.'
      )
    } finally {
      setPendingAction(null)
    }
  }

  async function handleWatchedSave() {
    if (reviewTooLong) {
      setError('Review must be 200 words or fewer.')
      return
    }

    setPendingAction('watched')
    setError('')

    try {
      await saveMovieWatchedEntry({
        fallbackError: 'Could not update watched list.',
        movieId,
        rating,
        reviewText: normalizeClientReviewText(reviewText) || null,
      })

      setInWatched(true)
      setWatchedDialogOpen(false)

      if (inWant) {
        setRemoveWantDialogOpen(true)
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not update watched list.'
      )
    } finally {
      setPendingAction(null)
    }
  }

  async function handleRemoveWantAfterWatched() {
    setPendingAction('want')
    setError('')

    try {
      const nextInWant = await toggleListAction({
        endpoint: `/api/me/movies/${movieId}/want`,
        fallbackError: 'Could not update want list.',
        isActive: true,
      })

      setInWant(nextInWant)
      setRemoveWantDialogOpen(false)

      refreshIfOnWantList()
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not update want list.'
      )
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (!pendingAction) {
              void handleWantToggle()
            }
          }}
          disabled={pendingAction !== null}
          className={buildListActionButtonClass({
            compact,
            isActive: inWant,
          })}
        >
          {inWant ? 'IN WANT LIST' : 'WANT'}
        </button>

        <button
          type="button"
          onClick={() => {
            if (!pendingAction) {
              void handleWatchedToggle()
            }
          }}
          disabled={pendingAction !== null}
          className={buildListActionButtonClass({
            compact,
            isActive: inWatched,
            tone: 'positive',
          })}
        >
          {inWatched ? 'WATCHED' : 'MARK WATCHED'}
        </button>
      </div>

      {error && !watchedDialogOpen ? (
        <p className="mt-2 text-[0.78rem] leading-[1.5] text-status-error">
          {error}
        </p>
      ) : null}

      {watchedDialogOpen ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 px-5 py-8">
          <div className="w-full max-w-[560px] rounded-panel border border-border-strong bg-card-bg p-6 shadow-popover">
            <div className="mb-6">
              <h3 className="mb-2 text-[1.5rem] font-black leading-[1.05]">
                MARK WATCHED
              </h3>
              <p className="m-0 text-[0.92rem] leading-[1.6] text-text-secondary">
                Add an optional rating and a short review.
              </p>
              {inWant ? (
                <p className="mt-3 text-[0.82rem] leading-[1.6] text-accent-positive">
                  After saving, you can choose whether to keep this film in Want to
                  watch in theaters.
                </p>
              ) : null}
            </div>

            <WatchedReviewFields
              error={error}
              pending={pendingAction !== null}
              rating={rating}
              reviewText={reviewText}
              reviewTooLong={reviewTooLong}
              reviewWordCount={reviewWordCount}
              onRatingChange={setRating}
              onReviewTextChange={setReviewText}
            />

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!pendingAction) {
                    setWatchedDialogOpen(false)
                    setError('')
                  }
                }}
                disabled={pendingAction !== null}
                className="rounded-panel border border-border-input px-4 py-3 text-[0.86rem] font-semibold text-text-secondary transition-colors hover:border-text-primary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!pendingAction) {
                    void handleWatchedSave()
                  }
                }}
                disabled={pendingAction !== null || reviewTooLong}
                className="rounded-panel border border-accent-positive bg-accent-positive px-4 py-3 text-[0.86rem] font-bold text-page-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingAction === 'watched' ? 'Saving...' : 'Save watched'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeWantDialogOpen ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 px-5 py-8">
          <div className="w-full max-w-[520px] rounded-panel border border-border-strong bg-card-bg p-6 shadow-popover">
            <div className="mb-6">
              <h3 className="mb-2 text-[1.5rem] font-black leading-[1.05]">
                KEEP IN WANT LIST?
              </h3>
              <p className="m-0 text-[0.92rem] leading-[1.6] text-text-secondary">
                This film was marked as watched and saved successfully. Do you also want
                to remove it from Want to watch in theaters?
              </p>
            </div>

            {error ? (
              <p className="mb-6 text-[0.82rem] leading-[1.6] text-status-error">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!pendingAction) {
                    setRemoveWantDialogOpen(false)
                    setError('')
                  }
                }}
                disabled={pendingAction !== null}
                className="rounded-panel border border-border-input px-4 py-3 text-[0.86rem] font-semibold text-text-secondary transition-colors hover:border-text-primary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Keep in want
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!pendingAction) {
                    void handleRemoveWantAfterWatched()
                  }
                }}
                disabled={pendingAction !== null}
                className="rounded-panel border border-text-primary bg-text-primary px-4 py-3 text-[0.86rem] font-bold text-page-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingAction === 'want' ? 'Removing...' : 'Remove from want'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
