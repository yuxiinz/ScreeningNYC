// app/(browse)/page.tsx

import Link from 'next/link'

import BackToTopButton from '@/components/BackToTopButton'
import FilmSearchBox from '@/components/FilmSearchBox'
import MovieGridCard from '@/components/movie/MovieGridCard'
import MovieListActions from '@/components/movie/MovieListActions'
import PaginationControls from '@/components/PaginationControls'
import TheaterFilter from '@/components/TheaterFilter'
import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import {
  getCachedHomeMovies,
  getCachedTheaterDirectory,
} from '@/lib/cache/public-data'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import { parsePositivePage, parseTheaterSlugs } from '@/lib/routing/search-params'
import { getTodayInAppTimezone } from '@/lib/timezone'
import { getMovieStatesForUser } from '@/lib/user-movies/service'

const FILMS_PAGE_SIZE = 48

type HomePageSearchParams = {
  theaters?: string | string[]
  page?: string | string[]
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<HomePageSearchParams>
}) {
  const params = await searchParams
  const selectedTheaterSlugs = [...new Set(parseTheaterSlugs(params.theaters))].sort()
  const currentPage = parsePositivePage(params.page)

  const todayKey = getTodayInAppTimezone()
  const [currentUserId, allTheaters, homeMovies] = await Promise.all([
    getCurrentUserId(),
    getCachedTheaterDirectory(),
    getCachedHomeMovies({
      selectedTheaterSlugs,
      todayKey,
      page: currentPage,
      pageSize: FILMS_PAGE_SIZE,
    }),
  ])
  const { movies, safePage, totalCount, totalPages } = homeMovies

  const theatersWithSlug = allTheaters.filter(
    (
      theater: (typeof allTheaters)[number]
    ): theater is (typeof allTheaters)[number] & { slug: string } =>
      !!theater.slug
  )

  const selectedTheaterNames = theatersWithSlug
    .filter(theater => selectedTheaterSlugs.includes(theater.slug))
    .map(theater => theater.name)
  const movieStates = await getMovieStatesForUser(
    currentUserId,
    movies.map((movie) => movie.id)
  )

  const startIndex = totalCount === 0 ? 0 : (safePage - 1) * FILMS_PAGE_SIZE + 1
  const endIndex =
    totalCount === 0 ? 0 : Math.min(startIndex + movies.length - 1, totalCount)
  const filmCountLabel = `${totalCount} scheduled film${totalCount === 1 ? '' : 's'}`

  const subtitle =
    selectedTheaterNames.length > 0
      ? `${filmCountLabel} at ${selectedTheaterNames.join(', ')}.`
      : `${filmCountLabel} across NYC theaters.`

  return (
    <>
      <div className="mx-auto mb-5 flex max-w-[var(--container-wide)] justify-end">
        <FilmSearchBox isAuthenticated={Boolean(currentUserId)} />
      </div>

      <main className="mx-auto max-w-[var(--container-wide)]">
        {!currentUserId ? (
          <section className="mb-7 rounded-card border border-border-input bg-[linear-gradient(135deg,rgba(17,17,17,0.96),rgba(0,181,29,0.14))] px-5 py-4 shadow-card">
            <p className="mb-2 text-[0.74rem] font-semibold tracking-[0.08em] text-text-dim">
              PERSONAL WATCHLIST
            </p>
            <p className="m-0 max-w-[780px] text-[1rem] leading-[1.7] text-text-primary">
              <Link
                href="/register"
                className="border-b border-text-primary font-semibold text-text-primary transition-colors hover:text-accent-positive"
              >
                Create an account
              </Link>{' '}
              or{' '}
              <Link
                href="/login"
                className="border-b border-text-primary font-semibold text-text-primary transition-colors hover:text-accent-positive"
              >
                log in
              </Link>{' '}
              to save films to your want list and get email reminders when they
              screen in NYC.
            </p>
          </section>
        ) : null}

        <div className="mb-7">
          <TheaterFilter
            theaters={theatersWithSlug.map(theater => ({
              slug: theater.slug,
              name: theater.name,
            }))}
            selectedTheaters={selectedTheaterSlugs}
          />

          <p className="mb-[18px] text-[0.98rem] leading-[1.5] text-text-primary">
            {subtitle}
          </p>

          <p className="m-0 text-[0.88rem] leading-[1.5] text-text-muted">
            Showing {startIndex}-{endIndex} of {totalCount}.
          </p>
        </div>

        <div className="grid gap-7 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {movies.map(movie => {
            const movieState = movieStates.get(movie.id) || {
              inWant: false,
              inWatched: false,
            }

            return (
              <MovieGridCard
                key={movie.id}
                href={`/films/${movie.id}`}
                title={movie.title}
                posterUrl={movie.posterUrl}
                directorText={movie.directorText}
                releaseDate={movie.releaseDate}
              >
                {currentUserId ? (
                  <MovieListActions
                    movieId={movie.id}
                    initialInWant={movieState.inWant}
                    initialInWatched={movieState.inWatched}
                    compact
                    className="mt-3 px-0.5"
                  />
                ) : null}

                <MovieExternalLinks
                  imdbUrl={movie.imdbUrl}
                  doubanUrl={movie.doubanUrl}
                  letterboxdUrl={movie.letterboxdUrl}
                  size="sm"
                  className="mt-3 px-0.5 text-[0.68rem] font-bold"
                />
              </MovieGridCard>
            )
          })}
        </div>

        {totalPages > 1 ? (
          <PaginationControls currentPage={safePage} totalPages={totalPages} />
        ) : null}
      </main>

      <BackToTopButton />
      <footer className="h-[100px]" />
    </>
  )
}
