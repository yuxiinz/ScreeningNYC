'use client'

import { useState } from 'react'

type MovieListActionsProps = {
  movieId: number
  initialInWant: boolean
  initialInWatched: boolean
  compact?: boolean
  className?: string
}

type PendingAction = 'want' | 'watched' | null

type MutationErrorPayload = {
  message?: string
}

function buildButtonClass(
  isActive: boolean,
  tone: 'default' | 'positive',
  compact: boolean
) {
  return [
    'rounded-panel border font-bold tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    compact ? 'px-2.5 py-1.5 text-[0.68rem]' : 'px-3 py-2 text-[0.76rem]',
    tone === 'positive'
      ? isActive
        ? 'border-accent-positive bg-accent-positive text-page-bg'
        : 'border-border-input text-text-secondary hover:border-accent-positive hover:text-accent-positive'
      : isActive
        ? 'border-text-primary bg-text-primary text-page-bg'
        : 'border-border-input text-text-secondary hover:border-text-primary hover:text-text-primary',
  ].join(' ')
}

async function getErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const payload = (await response.json()) as MutationErrorPayload
    return payload.message || fallbackMessage
  } catch {
    return fallbackMessage
  }
}

export default function MovieListActions({
  movieId,
  initialInWant,
  initialInWatched,
  compact = false,
  className,
}: MovieListActionsProps) {
  const [inWant, setInWant] = useState(initialInWant)
  const [inWatched, setInWatched] = useState(initialInWatched)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [error, setError] = useState('')

  async function handleWantToggle() {
    setPendingAction('want')
    setError('')

    try {
      const response = await fetch(`/api/me/movies/${movieId}/want`, {
        method: inWant ? 'DELETE' : 'PUT',
      })

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, 'Could not update want list.')
        )
      }

      setInWant(!inWant)
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
    setError('')
    let confirmRemoveWant = false

    if (!inWatched && inWant) {
      confirmRemoveWant = window.confirm(
        'Mark as watched and remove it from Want to watch in theaters?'
      )

      if (!confirmRemoveWant) {
        return
      }
    }

    setPendingAction('watched')

    try {
      const response = await fetch(`/api/me/movies/${movieId}/watched`, {
        method: inWatched ? 'DELETE' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: inWatched
          ? undefined
          : JSON.stringify({
              confirmRemoveWant,
            }),
      })

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, 'Could not update watched list.')
        )
      }

      if (inWatched) {
        setInWatched(false)
        return
      }

      setInWatched(true)

      if (inWant) {
        setInWant(false)
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
          className={buildButtonClass(inWant, 'default', compact)}
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
          className={buildButtonClass(inWatched, 'positive', compact)}
        >
          {inWatched ? 'WATCHED' : 'MARK WATCHED'}
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-[0.78rem] leading-[1.5] text-[#ffb3b3]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
