import Link from 'next/link'
import { notFound } from 'next/navigation'

import MarketplacePostCard from '@/components/marketplace/MarketplacePostCard'
import ShowtimeRow from '@/components/showtime/ShowtimeRow'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import { getMarketplaceMoviePageData } from '@/lib/marketplace/service'

const ACTION_LINK_CLASS =
  'rounded-panel border border-border-input px-4 py-3 text-[0.8rem] font-semibold tracking-[0.08em] text-text-secondary transition-colors hover:border-text-primary hover:text-text-primary'

function buildCreateHref(
  movieId: number,
  type: 'BUY' | 'SELL'
) {
  return `/market/new?type=${type}&movieId=${movieId}`
}

export default async function MarketplaceMoviePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const movieId = Number.parseInt(id, 10)

  if (!Number.isInteger(movieId) || movieId <= 0) {
    notFound()
  }

  const currentUserId = await getCurrentUserId()
  const data = await getMarketplaceMoviePageData(movieId, currentUserId)

  if (!data) {
    notFound()
  }

  const redirectPath = `/market/films/${movieId}`

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <section className="mb-8 border-b border-border-strong pb-6">
        <p className="mb-3 text-[0.82rem] font-semibold tracking-[0.12em] text-text-dim">
          <Link href="/market" className="hover:text-text-primary">
            MARKET
          </Link>{' '}
          / {data.movie.title.toUpperCase()}
        </p>

        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-[760px]">
            <h1 className="mb-3 text-[2.6rem] font-black leading-[1.04]">
              {data.movie.title.toUpperCase()}
            </h1>
            <p className="m-0 text-[0.95rem] leading-[1.7] text-text-secondary">
              Active marketplace posts are grouped by showtime. Open a card to
              see public trade details, then reveal contact info if you are
              signed in.
            </p>
            {!currentUserId ? (
              <p className="mt-3 text-[0.82rem] leading-[1.6] text-text-dim">
                Sign in to post a trade or contact other members.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={buildCreateHref(movieId, 'SELL')}
              className={ACTION_LINK_CLASS}
            >
              I WANT TO SELL
            </Link>
            <Link
              href={buildCreateHref(movieId, 'BUY')}
              className={ACTION_LINK_CLASS}
            >
              I WANT TO BUY
            </Link>
          </div>
        </div>
      </section>

      {data.sections.length > 0 ? (
        <div className="space-y-8">
          {data.sections.map((section) => (
            <section
              key={section.showtime.id}
              className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card"
            >
              <ShowtimeRow
                movieTitle={data.movie.title}
                showtime={section.showtime}
                fallbackRuntimeMinutes={data.movie.runtimeMinutes}
              />

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-[1rem] font-bold">SELL</h2>
                    <span className="text-[0.76rem] tracking-[0.08em] text-text-muted">
                      {section.activeSellCount}
                    </span>
                  </div>

                  {section.sells.length > 0 ? (
                    <div className="space-y-3">
                      {section.sells.map((post) => (
                        <MarketplacePostCard
                          key={post.id}
                          movieId={movieId}
                          post={post}
                          redirectPath={redirectPath}
                          showtimeId={section.showtime.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-panel border border-dashed border-border-input px-4 py-4 text-[0.86rem] leading-[1.6] text-text-dim">
                      No one is selling for this showtime yet.
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-[1rem] font-bold">BUY</h2>
                    <span className="text-[0.76rem] tracking-[0.08em] text-text-muted">
                      {section.activeBuyCount}
                    </span>
                  </div>

                  {section.buys.length > 0 ? (
                    <div className="space-y-3">
                      {section.buys.map((post) => (
                        <MarketplacePostCard
                          key={post.id}
                          movieId={movieId}
                          post={post}
                          redirectPath={redirectPath}
                          showtimeId={section.showtime.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-panel border border-dashed border-border-input px-4 py-4 text-[0.86rem] leading-[1.6] text-text-dim">
                      No one is buying for this showtime yet.
                    </p>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="rounded-panel border border-border-default bg-card-bg p-6 shadow-card">
          <h2 className="mb-2 text-[1.2rem] font-bold">No active marketplace posts</h2>
          <p className="m-0 text-[0.92rem] leading-[1.7] text-text-secondary">
            This film does not have any live BUY or SELL activity right now.
          </p>
        </section>
      )}
    </main>
  )
}
