'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { buildListActionButtonClass } from '@/components/list-actions/shared'
import { getErrorMessageFromResponse } from '@/lib/api/client-response'
import type { MarketplacePostTypeValue } from '@/lib/marketplace/shared'

type MarketplaceOwnPostActionsProps = {
  editHref: string
  postId: number
  type: MarketplacePostTypeValue
}

export default function MarketplaceOwnPostActions({
  editHref,
  postId,
  type,
}: MarketplaceOwnPostActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleStatusUpdate(method: 'PATCH' | 'DELETE') {
    if (isPending) {
      return
    }

    setError('')

    startTransition(async () => {
      try {
        const response = await fetch(`/api/me/marketplace/posts/${postId}`, {
          method,
          headers:
            method === 'PATCH'
              ? {
                  'Content-Type': 'application/json',
                }
              : undefined,
          body:
            method === 'PATCH'
              ? JSON.stringify({
                  status: 'COMPLETED',
                })
              : undefined,
        })

        if (!response.ok) {
          throw new Error(
            await getErrorMessageFromResponse(
              response,
              'Could not update marketplace post right now.'
            )
          )
        }

        router.refresh()
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Could not update marketplace post right now.'
        )
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Link
          href={editHref}
          className={buildListActionButtonClass({
            compact: true,
            isActive: false,
          })}
        >
          EDIT
        </Link>

        <button
          type="button"
          disabled={isPending}
          onClick={() => handleStatusUpdate('DELETE')}
          className={buildListActionButtonClass({
            compact: true,
            isActive: false,
          })}
        >
          {isPending ? 'WORKING...' : 'CANCEL'}
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={() => handleStatusUpdate('PATCH')}
          className={buildListActionButtonClass({
            compact: true,
            isActive: false,
            tone: 'positive',
          })}
        >
          {type === 'SELL' ? 'MARK SOLD' : 'MARK BOUGHT'}
        </button>
      </div>

      {error ? (
        <p className="text-[0.78rem] leading-[1.5] text-status-error">{error}</p>
      ) : null}
    </div>
  )
}
