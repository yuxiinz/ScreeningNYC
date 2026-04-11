import Link from 'next/link'

import MarketplaceOwnPostActions from '@/components/marketplace/MarketplaceOwnPostActions'
import ShowtimeRow from '@/components/showtime/ShowtimeRow'
import { requireUserIdForPage } from '@/lib/auth/require-user-id'
import { getMyMarketplacePostsPageData } from '@/lib/marketplace/service'
import { APP_TIMEZONE } from '@/lib/timezone'

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

export default async function MyMarketplacePage() {
  const userId = await requireUserIdForPage('/me/market')
  const posts = await getMyMarketplacePostsPageData(userId)
  const activePosts = posts.filter((post) => post.status === 'ACTIVE')
  const closedPosts = posts.filter((post) => post.status !== 'ACTIVE')

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <section className="mb-8">
        <p className="mb-3 text-[0.82rem] font-semibold tracking-[0.12em] text-text-dim">
          <Link href="/me" className="hover:text-text-primary">
            ME
          </Link>{' '}
          / MARKET
        </p>
        <h1 className="mb-2 text-[2.4rem] font-black leading-[1.05]">
          MY MARKETPLACE POSTS
        </h1>
        <p className="m-0 max-w-[760px] text-[0.96rem] leading-[1.7] text-text-secondary">
          Manage the BUY and SELL posts tied to your upcoming showtimes. Active
          posts stay visible in the marketplace until you cancel them or mark
          them complete.
        </p>
      </section>

      <section className="space-y-8">
        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-[1.2rem] font-bold">Active</h2>
            <Link
              href="/market"
              className="text-[0.78rem] font-semibold tracking-[0.08em] text-text-secondary underline underline-offset-4 hover:text-text-primary"
            >
              OPEN MARKET
            </Link>
          </div>

          {activePosts.length > 0 ? (
            <div className="space-y-4">
              {activePosts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="m-0 text-[0.78rem] tracking-[0.08em] text-accent-positive">
                        {post.type}
                      </p>
                      <h3 className="mt-1 text-[1.1rem] font-bold">
                        <Link
                          href={`/market/films/${post.showtime.movie.id}`}
                          className="hover:text-text-secondary"
                        >
                          {post.showtime.movie.title}
                        </Link>
                      </h3>
                      <p className="m-0 text-[0.84rem] leading-[1.6] text-text-secondary">
                        {formatQuantity(post.quantity)}
                        {post.type === 'SELL' && post.priceCents !== null
                          ? ` · ${formatPrice(post.priceCents)}`
                          : ''}
                        {post.type === 'SELL' && post.seatInfo
                          ? ` · ${post.seatInfo}`
                          : ''}
                      </p>
                    </div>

                    <p className="m-0 text-[0.78rem] leading-[1.6] text-text-dim">
                      Updated {DATE_TIME_FORMATTER.format(post.updatedAt)}
                    </p>
                  </div>

                  <ShowtimeRow
                    movieTitle={post.showtime.movie.title}
                    showDate
                    showtime={post.showtime}
                  />

                  <div className="mt-4">
                    <MarketplaceOwnPostActions
                      editHref={`/market/new?type=${post.type}&movieId=${post.showtime.movie.id}&showtimeId=${post.showtime.id}`}
                      postId={post.id}
                      type={post.type}
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card">
              <p className="m-0 text-[0.9rem] leading-[1.7] text-text-secondary">
                You do not have any active marketplace posts right now.
              </p>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-4 text-[1.2rem] font-bold">Completed / canceled</h2>

          {closedPosts.length > 0 ? (
            <div className="space-y-4">
              {closedPosts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="m-0 text-[0.78rem] tracking-[0.08em] text-text-dim">
                        {post.type} · {post.status}
                      </p>
                      <h3 className="mt-1 text-[1.1rem] font-bold">
                        <Link
                          href={`/market/films/${post.showtime.movie.id}`}
                          className="hover:text-text-secondary"
                        >
                          {post.showtime.movie.title}
                        </Link>
                      </h3>
                    </div>

                    <p className="m-0 text-[0.78rem] leading-[1.6] text-text-dim">
                      {post.closedAt
                        ? `Closed ${DATE_TIME_FORMATTER.format(post.closedAt)}`
                        : `Updated ${DATE_TIME_FORMATTER.format(post.updatedAt)}`}
                    </p>
                  </div>

                  <ShowtimeRow
                    movieTitle={post.showtime.movie.title}
                    showDate
                    showtime={post.showtime}
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card">
              <p className="m-0 text-[0.9rem] leading-[1.7] text-text-secondary">
                Completed and canceled posts will show up here.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
