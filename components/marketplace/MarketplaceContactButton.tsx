'use client'

import { useState, useTransition } from 'react'

import { buildListActionButtonClass } from '@/components/list-actions/shared'
import { getErrorMessageFromResponse } from '@/lib/api/client-response'

type MarketplaceContactButtonProps = {
  postId: number
}

export default function MarketplaceContactButton({
  postId,
}: MarketplaceContactButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [contact, setContact] = useState('')
  const [error, setError] = useState('')

  function handleClick() {
    if (contact || isPending) {
      return
    }

    setError('')

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/me/marketplace/posts/${postId}/contact`
        )

        if (!response.ok) {
          throw new Error(
            await getErrorMessageFromResponse(
              response,
              'Could not load contact details right now.'
            )
          )
        }

        const data = (await response.json()) as {
          contact?: unknown
        }

        if (typeof data.contact !== 'string' || !data.contact.trim()) {
          throw new Error('Contact details were unavailable.')
        }

        setContact(data.contact)
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Could not load contact details right now.'
        )
      }
    })
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || Boolean(contact)}
        className={buildListActionButtonClass({
          compact: true,
          isActive: Boolean(contact),
        })}
      >
        {contact ? 'CONTACT READY' : isPending ? 'LOADING...' : 'CONTACT'}
      </button>

      {contact ? (
        <div className="rounded-panel border border-border-input bg-page-bg px-3 py-3 text-[0.82rem] leading-[1.6] text-text-body">
          {contact}
        </div>
      ) : null}

      {error ? (
        <p className="text-[0.78rem] leading-[1.5] text-status-error">{error}</p>
      ) : null}
    </div>
  )
}
