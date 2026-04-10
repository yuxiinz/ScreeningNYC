/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'

import MarketplaceContactButton from '@/components/marketplace/MarketplaceContactButton'
import MarketplaceOwnPostActions from '@/components/marketplace/MarketplaceOwnPostActions'
import type { MarketplacePostPublicCard } from '@/lib/marketplace/service'
import { APP_TIMEZONE } from '@/lib/timezone'

type MarketplacePostCardProps = {
  movieId: number
  post: MarketplacePostPublicCard
  redirectPath: string
  showtimeId: number
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatQuantity(quantity: number) {
  return `${quantity} ticket${quantity === 1 ? '' : 's'}`
}

function formatPrice(priceCents: number | null) {
  if (typeof priceCents !== 'number') {
    return null
  }

  return `$${(priceCents / 100).toFixed(2)}`
}

function getAvatarLabel(displayName: string) {
  return displayName
    .split(/\s+/)
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function MarketplacePostCard({
  movieId,
  post,
  redirectPath,
  showtimeId,
}: MarketplacePostCardProps) {
  const editHref = `/market/new?type=${post.type}&movieId=${movieId}&showtimeId=${showtimeId}`

  return (
    <details className="rounded-panel border border-border-default bg-card-bg shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {post.user.imageUrl ? (
            <img
              src={post.user.imageUrl}
              alt={post.user.displayName}
              className="h-10 w-10 rounded-full border border-border-input object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border-input bg-page-bg text-[0.82rem] font-bold text-text-secondary">
              {getAvatarLabel(post.user.displayName)}
            </div>
          )}

          <div className="min-w-0">
            <p className="m-0 truncate text-[0.92rem] font-semibold leading-[1.4]">
              {post.user.displayName}
              {post.isOwnPost ? (
                <span className="ml-2 text-[0.72rem] tracking-[0.08em] text-accent-positive">
                  YOU
                </span>
              ) : null}
            </p>
            <p className="m-0 text-[0.78rem] leading-[1.5] text-text-muted">
              Updated {DATE_TIME_FORMATTER.format(post.updatedAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="rounded-panel border border-border-input px-2 py-1 text-[0.72rem] font-semibold tracking-[0.08em] text-text-secondary">
            {formatQuantity(post.quantity)}
          </span>

          {post.type === 'SELL' && post.priceCents !== null ? (
            <span className="rounded-panel border border-border-input px-2 py-1 text-[0.72rem] font-semibold tracking-[0.08em] text-text-secondary">
              {formatPrice(post.priceCents)}
            </span>
          ) : null}
        </div>
      </summary>

      <div className="border-t border-border-subtle px-4 py-4">
        <div className="space-y-3 text-[0.86rem] leading-[1.6] text-text-body">
          <p className="m-0">
            Quantity: {formatQuantity(post.quantity)}
          </p>

          {post.type === 'SELL' && post.priceCents !== null ? (
            <p className="m-0">Price: {formatPrice(post.priceCents)}</p>
          ) : null}

          {post.type === 'SELL' && post.seatInfo ? (
            <p className="m-0">Seat: {post.seatInfo}</p>
          ) : null}
        </div>

        <div className="mt-4">
          {post.isOwnPost ? (
            <MarketplaceOwnPostActions
              editHref={editHref}
              postId={post.id}
              type={post.type}
            />
          ) : post.canContact ? (
            <MarketplaceContactButton postId={post.id} />
          ) : (
            <Link
              href={`/login?redirectTo=${encodeURIComponent(redirectPath)}`}
              className="text-[0.82rem] font-semibold tracking-[0.08em] text-text-secondary underline underline-offset-4 hover:text-text-primary"
            >
              LOGIN TO CONTACT
            </Link>
          )}
        </div>
      </div>
    </details>
  )
}
