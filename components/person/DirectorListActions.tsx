'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type DirectorListActionsProps = {
  personId: number
  initialInWant: boolean
  compact?: boolean
  className?: string
}

type MutationErrorPayload = {
  message?: string
}

function buildButtonClass(isActive: boolean, compact: boolean) {
  return [
    'rounded-panel border font-bold tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    compact ? 'px-2.5 py-1.5 text-[0.68rem]' : 'px-3 py-2 text-[0.76rem]',
    isActive
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

export default function DirectorListActions({
  personId,
  initialInWant,
  compact = false,
  className,
}: DirectorListActionsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [inWant, setInWant] = useState(initialInWant)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleToggle() {
    setPending(true)
    setError('')

    try {
      const response = await fetch(`/api/me/people/${personId}/want`, {
        method: inWant ? 'DELETE' : 'PUT',
      })

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, 'Could not update director want list.')
        )
      }

      setInWant(!inWant)

      if (pathname === '/me/want-list') {
        router.refresh()
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not update director want list.'
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          if (!pending) {
            void handleToggle()
          }
        }}
        disabled={pending}
        className={buildButtonClass(inWant, compact)}
      >
        {inWant ? 'UNMARK' : 'WANT'}
      </button>

      {error ? (
        <p className="mt-2 text-[0.78rem] leading-[1.5] text-[#ffb3b3]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
