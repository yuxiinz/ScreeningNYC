import Link from 'next/link'

import MovieGridCard from '@/components/movie/MovieGridCard'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import { getMarketplaceHomePageData } from '@/lib/marketplace/service'

const CTA_LINK_CLASS =
  'rounded-panel border border-text-primary px-4 py-3 text-[0.8rem] font-semibold tracking-[0.08em] transition-colors hover:bg-text-primary hover:text-page-bg'

function buildMarketCreateHref(
  userId: string | null,
  type: 'BUY' | 'SELL',
  redirectTo: string
) {
  if (userId) {
    return `/market/new?type=${type}`
  }

  return `/login?redirectTo=${encodeURIComponent(redirectTo)}`
}

export default async function MarketplaceHomePage() {
  const currentUserId = await getCurrentUserId()
  const cards = await getMarketplaceHomePageData()

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <section className="mb-10 flex flex-wrap items-end justify-between gap-5 border-b border-border-strong pb-6">
        <div className="max-w-[780px]">
          <p className="mb-3 text-[0.82rem] font-semibold tracking-[0.12em] text-text-dim">
            MARKETPLACE
          </p>
          <h1 className="mb-3 text-[2.7rem] font-black leading-[1.02]">
            BUY AND SELL BY MOVIE.
          </h1>
          <p className="m-0 text-[0.96rem] leading-[1.7] text-text-secondary">
            Browse active marketplace posts by film, then open a movie to see
            each showtime split into BUY and SELL. Trades finish off-site after
            members exchange contact info.
          </p>
          {!currentUserId ? (
            <p className="mt-3 text-[0.82rem] leading-[1.6] text-text-dim">
              Sign in to post a trade or reveal contact details.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={buildMarketCreateHref(currentUserId, 'SELL', '/market/new?type=SELL')}
            className={CTA_LINK_CLASS}
          >
            I WANT TO SELL
          </Link>
          <Link
            href={buildMarketCreateHref(currentUserId, 'BUY', '/market/new?type=BUY')}
            className={CTA_LINK_CLASS}
          >
            I WANT TO BUY
          </Link>
        </div>
      </section>

      {cards.length > 0 ? (
        <section className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 xl:grid-cols-5">
          {cards.map((card) => (
            <MovieGridCard
              key={card.movie.id}
              href={`/market/films/${card.movie.id}`}
              title={card.movie.title}
              posterUrl={card.movie.posterUrl}
              directorText={card.movie.directorText}
              releaseDate={card.movie.releaseDate}
            >
              <div className="mt-4 rounded-panel border border-border-default bg-card-bg px-3 py-3 text-[0.78rem] leading-[1.7] text-text-secondary">
                <p className="m-0">{card.activeSellCount} selling</p>
                <p className="m-0">{card.activeBuyCount} buying</p>
                <p className="m-0">{card.activeShowtimeCount} active showtimes</p>
              </div>
            </MovieGridCard>
          ))}
        </section>
      ) : (
        <section className="rounded-panel border border-border-default bg-card-bg p-6 shadow-card">
          <h2 className="mb-2 text-[1.2rem] font-bold">No active posts yet</h2>
          <p className="m-0 max-w-[700px] text-[0.92rem] leading-[1.7] text-text-secondary">
            As soon as members start posting BUY and SELL requests, films with
            live marketplace activity will show up here.
          </p>
        </section>
      )}
    </main>
  )
}
