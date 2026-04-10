import Link from 'next/link'

import MarketplaceMovieSearchBox from '@/components/marketplace/MarketplaceMovieSearchBox'
import MarketplacePostForm from '@/components/marketplace/MarketplacePostForm'
import MarketplaceShowtimeSelector from '@/components/marketplace/MarketplaceShowtimeSelectorIsland'
import { requireUserIdForPage } from '@/lib/auth/require-user-id'
import { getMarketplaceNewPageData } from '@/lib/marketplace/service'
import { normalizeMarketplacePostType } from '@/lib/marketplace/shared'
import { getFirstSearchParamValue } from '@/lib/routing/search-params'

const STEP_LINK_CLASS =
  'rounded-panel border border-border-input px-4 py-3 text-[0.8rem] font-semibold tracking-[0.08em] text-text-secondary transition-colors hover:border-text-primary hover:text-text-primary'
const ACTIVE_STEP_LINK_CLASS =
  'rounded-panel border border-text-primary bg-text-primary px-4 py-3 text-[0.8rem] font-semibold tracking-[0.08em] text-page-bg'

type MarketplaceNewPageSearchParams = {
  type?: string | string[]
  movieId?: string | string[]
  showtimeIds?: string | string[]
  showtimeId?: string | string[]
}

function parsePositiveInteger(value?: string | string[]) {
  const parsedValue = Number.parseInt(getFirstSearchParamValue(value) || '', 10)

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null
  }

  return parsedValue
}

function parsePositiveIntegerList(value?: string | string[]) {
  const rawValue = getFirstSearchParamValue(value)

  if (!rawValue) {
    return []
  }

  return [...new Set(
    rawValue
      .split(',')
      .map((segment) => Number.parseInt(segment.trim(), 10))
      .filter((segment) => Number.isInteger(segment) && segment > 0)
  )]
}

function getTypeHref(type: 'BUY' | 'SELL') {
  return `/market/new?type=${type}`
}

export default async function MarketplaceNewPage({
  searchParams,
}: {
  searchParams: Promise<MarketplaceNewPageSearchParams>
}) {
  const params = await searchParams
  const redirectParams = new URLSearchParams()
  const rawType = getFirstSearchParamValue(params.type)
  const rawMovieId = getFirstSearchParamValue(params.movieId)
  const rawShowtimeIds = getFirstSearchParamValue(params.showtimeIds)
  const rawShowtimeId = getFirstSearchParamValue(params.showtimeId)

  if (rawType) {
    redirectParams.set('type', rawType)
  }

  if (rawMovieId) {
    redirectParams.set('movieId', rawMovieId)
  }

  if (rawShowtimeIds) {
    redirectParams.set('showtimeIds', rawShowtimeIds)
  } else if (rawShowtimeId) {
    redirectParams.set('showtimeId', rawShowtimeId)
  }

  const userId = await requireUserIdForPage(
    redirectParams.size > 0
      ? `/market/new?${redirectParams.toString()}`
      : '/market/new'
  )
  const selectedType = normalizeMarketplacePostType(
    getFirstSearchParamValue(params.type)
  )
  const movieId = parsePositiveInteger(params.movieId)
  const parsedShowtimeIds = parsePositiveIntegerList(params.showtimeIds)
  const legacyShowtimeId = parsePositiveInteger(params.showtimeId)
  const showtimeIds =
    parsedShowtimeIds.length > 0
      ? parsedShowtimeIds
      : legacyShowtimeId
        ? [legacyShowtimeId]
        : []
  const data = await getMarketplaceNewPageData(userId, {
    type: selectedType,
    movieId,
    showtimeIds,
  })
  const selectedMovie = data.selectedMovie
  const selectedShowtimes = data.availableShowtimes.filter((showtime) =>
    data.selectedShowtimeIds.includes(showtime.id)
  )

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <section className="mb-8 border-b border-border-strong pb-6">
        <p className="mb-3 text-[0.82rem] font-semibold tracking-[0.12em] text-text-dim">
          <Link href="/market" className="hover:text-text-primary">
            MARKET
          </Link>{' '}
          / NEW
        </p>
        <h1 className="mb-3 text-[2.6rem] font-black leading-[1.04]">
          NEW MARKETPLACE POST
        </h1>
        <p className="m-0 max-w-[760px] text-[0.96rem] leading-[1.7] text-text-secondary">
          1. Choose BUY or SELL. 2. Search a film with upcoming showtimes. 3.
          Pick the exact showtime. 4. Enter the details other members need.
        </p>
      </section>

      <div className="space-y-8">
        <section className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card">
          <p className="mb-3 text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
            STEP 1
          </p>
          <h2 className="mb-4 text-[1.2rem] font-bold">Choose a side</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href={getTypeHref('SELL')}
              className={
                selectedType === 'SELL' ? ACTIVE_STEP_LINK_CLASS : STEP_LINK_CLASS
              }
            >
              I WANT TO SELL
            </Link>
            <Link
              href={getTypeHref('BUY')}
              className={
                selectedType === 'BUY' ? ACTIVE_STEP_LINK_CLASS : STEP_LINK_CLASS
              }
            >
              I WANT TO BUY
            </Link>
          </div>
        </section>

        <section className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card">
          <p className="mb-3 text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
            STEP 2
          </p>
          <h2 className="mb-2 text-[1.2rem] font-bold">Search and select a film</h2>
          <p className="mb-4 text-[0.9rem] leading-[1.6] text-text-secondary">
            Only films with upcoming showtimes can move to the next step.
          </p>

          {selectedType ? (
            <MarketplaceMovieSearchBox selectedType={selectedType} />
          ) : (
            <p className="m-0 text-[0.88rem] leading-[1.6] text-text-dim">
              Choose BUY or SELL first.
            </p>
          )}

          {selectedMovie ? (
            <div className="mt-5 rounded-panel border border-border-default bg-page-bg px-4 py-4">
              <p className="mb-1 text-[0.78rem] tracking-[0.08em] text-text-dim">
                SELECTED FILM
              </p>
              <p className="m-0 text-[1rem] font-semibold">
                {selectedMovie.title}
              </p>
              {selectedMovie.directorText ? (
                <p className="mt-1 text-[0.84rem] text-text-secondary">
                  {selectedMovie.directorText}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card">
          <p className="mb-3 text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
            STEP 3
          </p>
          <h2 className="mb-4 text-[1.2rem] font-bold">Pick the showtime</h2>

          {selectedType && selectedMovie ? (
            data.availableShowtimes.length > 0 ? (
              <MarketplaceShowtimeSelector
                key={data.selectedShowtimeIds.join(',') || 'none'}
                initialSelectedShowtimeIds={data.selectedShowtimeIds}
                movieId={selectedMovie.id}
                movieTitle={selectedMovie.title}
                selectedType={selectedType}
                showtimes={data.availableShowtimes}
              />
            ) : (
              <p className="m-0 text-[0.88rem] leading-[1.6] text-text-dim">
                This film does not have any upcoming showtimes yet, so you
                cannot create a marketplace post for it.
              </p>
            )
          ) : (
            <p className="m-0 text-[0.88rem] leading-[1.6] text-text-dim">
              Choose a side and select a film first.
            </p>
          )}
        </section>

        <section className="pb-8">
          <p className="mb-3 text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
            STEP 4
          </p>

          {selectedType && selectedMovie && data.selectedShowtimeIds.length > 0 ? (
            <MarketplacePostForm
              initialDisplayName={data.user.displayName}
              requiresDisplayName={data.user.requiresDisplayName}
              movieId={selectedMovie.id}
              selectedShowtimeIds={data.selectedShowtimeIds}
              selectedShowtimes={selectedShowtimes}
              type={selectedType}
              existingPost={data.existingPost}
            />
          ) : (
            <div className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card">
              <p className="m-0 text-[0.9rem] leading-[1.7] text-text-secondary">
                Complete the first three steps to unlock the post form.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
