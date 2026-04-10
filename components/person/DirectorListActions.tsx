'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import {
  buildListActionButtonClass,
  toggleListAction,
} from '@/components/list-actions/shared'

type DirectorListActionsProps = {
  personId: number
  initialInWant: boolean
  compact?: boolean
  className?: string
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
      const nextInWant = await toggleListAction({
        endpoint: `/api/me/people/${personId}/want`,
        fallbackError: 'Could not update director want list.',
        isActive: inWant,
      })

      setInWant(nextInWant)

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
        className={buildListActionButtonClass({
          compact,
          isActive: inWant,
        })}
      >
        {inWant ? 'UNMARK' : 'WANT'}
      </button>

      {error ? (
        <p className="mt-2 text-[0.78rem] leading-[1.5] text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
