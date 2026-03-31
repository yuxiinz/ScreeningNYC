import Link from 'next/link'
import { redirect } from 'next/navigation'

import MovieListActions from '@/components/movie/MovieListActions'
import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import PosterImage from '@/components/movie/PosterImage'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import {
  cleanDirectorText,
  getReleaseYear,
  isTmdbPoster,
} from '@/lib/movie/display'
import {
  getMovieStatesForUser,
  getWatchedListPageData,
} from '@/lib/user-movies/service'

const POSTER_CARD_CLASS =
  'flex aspect-[2/3] w-32 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-card-bg shadow-poster'

function getPosterImageClass(posterIsTmdb: boolean) {
  return [
    'block h-full w-full bg-card-bg',
    posterIsTmdb ? 'object-cover' : 'object-contain',
  ].join(' ')
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(date)
}

export default async function WatchedPage() {
  const userId = await getCurrentUserId()

  if (!userId) {
    redirect('/login?redirectTo=/me/watched')
  }

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
        <p className="m-0 text-[0.98rem] leading-[1.6] text-text-secondary">
          You have watched {data.totalCount} film{data.totalCount === 1 ? '' : 's'}.
        </p>
      </section>

      {data.items.length > 0 ? (
        <div className="flex flex-col gap-6">
          {data.items.map((item) => {
            const posterIsTmdb = isTmdbPoster(item.movie.posterUrl)
            const director = cleanDirectorText(item.movie.directorText, 'UNKNOWN')
            const year = getReleaseYear(item.movie.releaseDate)
            const movieState = movieStates.get(item.movie.id) || {
              inWant: false,
              inWatched: true,
            }

            return (
              <article
                key={item.movie.id}
                className="flex flex-wrap items-start gap-6 rounded-panel border border-border-default bg-card-bg p-5 shadow-card"
              >
                <Link
                  href={`/films/${item.movie.id}`}
                  className="shrink-0 text-inherit no-underline"
                >
                  <div className={POSTER_CARD_CLASS}>
                    {item.movie.posterUrl ? (
                      <PosterImage
                        src={item.movie.posterUrl}
                        alt={item.movie.title}
                        className={getPosterImageClass(posterIsTmdb)}
                      />
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

                  {item.rating ? (
                    <p className="mb-2 text-[0.88rem] leading-[1.6] text-text-body">
                      Rated {item.rating}/5.
                    </p>
                  ) : null}

                  {item.reviewText ? (
                    <p className="mb-4 whitespace-pre-line text-[0.88rem] leading-[1.7] text-text-secondary">
                      {item.reviewText}
                    </p>
                  ) : null}

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
