import Link from 'next/link'

import MovieCsvImportButton from '@/components/movie/MovieCsvImportButton'
import MovieListActions from '@/components/movie/MovieListActions'
import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import PosterImage from '@/components/movie/PosterImage'
import WatchedReviewEditor from '@/components/movie/WatchedReviewEditor'
import { requireUserIdForPage } from '@/lib/auth/require-user-id'
import {
  cleanDirectorText,
  getReleaseYear,
} from '@/lib/movie/display'
import {
  getMovieStatesForUser,
  getWatchedListPageData,
} from '@/lib/user-movies/service'

const POSTER_CARD_CLASS =
  'flex aspect-[2/3] w-32 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-card-bg shadow-poster'

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(date)
}

export default async function WatchedPage() {
  const userId = await requireUserIdForPage('/me/watched')

  const data = await getWatchedListPageData(userId)
  const movieStates = await getMovieStatesForUser(
    userId,
    data.items.map((item) => item.movie.id)
  )

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <section className="mb-8">
        <p className="mb-3 text-[0.82rem] font-semibold tracking-[0.12em] text-text-dim">
          <Link href="/me" className="hover:text-text-primary">
            ME
          </Link>{' '}
          / WATCHED
        </p>
        <h1 className="mb-2 text-[2.4rem] font-black leading-[1.05]">WATCHED</h1>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <p className="m-0 text-[0.98rem] leading-[1.6] text-text-secondary lg:max-w-[720px]">
            You have watched {data.totalCount} film{data.totalCount === 1 ? '' : 's'}.
          </p>
          <MovieCsvImportButton listType="watched" className="lg:w-[360px]" />
        </div>
      </section>

      {data.items.length > 0 ? (
        <div className="flex flex-col gap-6">
          {data.items.map((item) => {
            const director = cleanDirectorText(item.movie.directorText, 'UNKNOWN')
            const year = getReleaseYear(item.movie.releaseDate)
            const movieState = movieStates.get(item.movie.id) || {
              inWant: false,
              inWatched: true,
            }

            return (
              <article
                key={item.movie.id}
                className="flex flex-wrap items-start gap-6 rounded-panel border border-border-default bg-card-bg p-5 shadow-card xl:flex-nowrap"
              >
                <div className="flex min-w-[320px] flex-1 flex-wrap items-start gap-6">
                  <Link
                    href={`/films/${item.movie.id}`}
                    className="shrink-0 text-inherit no-underline"
                  >
                    <div className={POSTER_CARD_CLASS}>
                      {item.movie.posterUrl ? (
                        <PosterImage src={item.movie.posterUrl} alt={item.movie.title} />
                      ) : (
                        <div className="px-3 text-center text-[0.82rem] text-text-empty">
                          No Poster
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="min-w-[260px] flex-1">
                    <h2 className="mb-2 text-[1.7rem] font-black leading-[1.08]">
                      <Link
                        href={`/films/${item.movie.id}`}
                        className="text-text-primary no-underline"
                      >
                        {item.movie.title.toUpperCase()}
                      </Link>
                    </h2>

                    <p className="mb-2 text-[0.95rem] leading-[1.5] text-text-secondary">
                      Directed by {director}
                    </p>

                    <p className="mb-4 text-[0.84rem] leading-[1.5] text-text-dim">
                      {[year, item.movie.runtimeMinutes ? `${item.movie.runtimeMinutes}min` : '']
                        .filter(Boolean)
                        .join(' / ')}
                    </p>

                    <p className="mb-4 text-[0.88rem] leading-[1.6] text-text-body">
                      Marked watched on {formatDate(item.watchedAt)}.
                    </p>

                    <MovieListActions
                      movieId={item.movie.id}
                      initialInWant={movieState.inWant}
                      initialInWatched={movieState.inWatched}
                      className="mb-4"
                    />

                    <MovieExternalLinks
                      imdbUrl={item.movie.imdbUrl}
                      doubanUrl={item.movie.doubanUrl}
                      letterboxdUrl={item.movie.letterboxdUrl}
                      size="sm"
                      className="text-[0.68rem] font-bold"
                    />
                  </div>
                </div>

                <WatchedReviewEditor
                  movieId={item.movie.id}
                  initialRating={item.rating}
                  initialReviewText={item.reviewText}
                  className="xl:w-[420px]"
                />
              </article>
            )
          })}
        </div>
      ) : (
        <div className="rounded-panel border border-border-default bg-card-bg p-6 shadow-card">
          <p className="m-0 text-[0.95rem] leading-[1.6] text-text-secondary">
            You have not marked any films as watched yet.
          </p>
        </div>
      )}
    </main>
  )
}
