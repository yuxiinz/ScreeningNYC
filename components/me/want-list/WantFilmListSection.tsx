import Link from 'next/link'

import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import MovieListActions from '@/components/movie/MovieListActions'
import PosterImage from '@/components/movie/PosterImage'
import {
  cleanDirectorText,
  getReleaseYear,
} from '@/lib/movie/display'
import type {
  MovieCollectionState,
  WantListPageData,
} from '@/lib/user-movies/service'
import {
  formatDateKeyInAppTimezone,
  formatTimeInAppTimezone,
  getDateKeyInAppTimezone,
} from '@/lib/timezone'

const POSTER_CARD_CLASS =
  'flex aspect-[2/3] w-32 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-card-bg shadow-poster'

type WantFilmListSectionProps = {
  items: WantListPageData['items']
  movieStates: Map<number, MovieCollectionState>
}

export default function WantFilmListSection({
  items,
  movieStates,
}: WantFilmListSectionProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-panel border border-border-default bg-card-bg p-6 shadow-card">
        <p className="m-0 text-[0.95rem] leading-[1.6] text-text-secondary">
          You have not added any films to Want to watch in theaters yet.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {items.map((item) => {
        const director = cleanDirectorText(item.movie.directorText, 'UNKNOWN')
        const year = getReleaseYear(item.movie.releaseDate)
        const nextShowtime = item.movie.showtimes[0]
        const movieState = movieStates.get(item.movie.id) || {
          inWant: true,
          inWatched: false,
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
                className="mb-4 text-[0.68rem] font-bold"
              />

              {nextShowtime ? (
                <div className="rounded-panel border border-border-default bg-page-bg px-4 py-3">
                  <p className="mb-1 text-[0.72rem] font-semibold tracking-[0.1em] text-accent-positive">
                    ON SCREEN NOW
                  </p>
                  <p className="m-0 text-[0.9rem] leading-[1.6] text-text-body">
                    Next showtime:{' '}
                    {formatDateKeyInAppTimezone(
                      getDateKeyInAppTimezone(nextShowtime.startTime)
                    )}{' '}
                    at {formatTimeInAppTimezone(nextShowtime.startTime)} at{' '}
                    {nextShowtime.theater.name}.
                  </p>
                </div>
              ) : (
                <p className="m-0 text-[0.88rem] leading-[1.6] text-text-dim">
                  Not currently on screen in NYC.
                </p>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
