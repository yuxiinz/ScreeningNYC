import Link from 'next/link'
import { redirect } from 'next/navigation'

import MovieListActions from '@/components/movie/MovieListActions'
import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import PosterImage from '@/components/movie/PosterImage'
import DirectorListActions from '@/components/person/DirectorListActions'
import PersonPhotoImage from '@/components/person/PersonPhotoImage'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import {
  cleanDirectorText,
  getReleaseYear,
  isTmdbPoster,
} from '@/lib/movie/display'
import {
  getMovieStatesForUser,
  getWantListPageData,
} from '@/lib/user-movies/service'
import { getWantDirectorListPageData } from '@/lib/user-directors/service'
import {
  formatDateKeyInAppTimezone,
  formatTimeInAppTimezone,
  getDateKeyInAppTimezone,
} from '@/lib/timezone'

const POSTER_CARD_CLASS =
  'flex aspect-[2/3] w-32 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-card-bg shadow-poster'
const DIRECTOR_PHOTO_CLASS =
  'flex aspect-[4/5] w-32 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-card-bg shadow-poster'
const TAB_CLASS =
  'border-b-2 pb-[6px] text-[0.86rem] font-semibold tracking-[0.06em] transition-colors'

function getPosterImageClass(posterIsTmdb: boolean) {
  return [
    'block h-full w-full bg-card-bg',
    posterIsTmdb ? 'object-cover' : 'object-contain',
  ].join(' ')
}

function getHeadline(totalCount: number, onScreenNowCount: number) {
  return `There ${totalCount === 1 ? 'is' : 'are'} ${totalCount} film${totalCount === 1 ? '' : 's'} you want to watch in theaters, ${onScreenNowCount} of them ${onScreenNowCount === 1 ? 'is' : 'are'} on screen in NYC now!`
}

function getDirectorHeadline(totalCount: number, onScreenNowCount: number) {
  return `There ${totalCount === 1 ? 'is' : 'are'} ${totalCount} director${totalCount === 1 ? '' : 's'} you want to follow, ${onScreenNowCount} of them ${onScreenNowCount === 1 ? 'currently has' : 'currently have'} films on screen in NYC now!`
}

export default async function WantListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const userId = await getCurrentUserId()

  if (!userId) {
    redirect('/login?redirectTo=/me/want-list')
  }

  const params = await searchParams
  const activeTab = params.tab === 'directors' ? 'directors' : 'films'
  const [filmData, directorData] = await Promise.all([
    getWantListPageData(userId),
    getWantDirectorListPageData(userId),
  ])
  const movieStates = await getMovieStatesForUser(
    userId,
    filmData.items.map((item) => item.movie.id)
  )

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <section className="mb-8">
        <p className="mb-3 text-[0.82rem] font-semibold tracking-[0.12em] text-text-dim">
          <Link href="/me" className="hover:text-text-primary">
            ME
          </Link>{' '}
          / WANT LIST
        </p>
        <h1 className="mb-2 text-[2.4rem] font-black leading-[1.05]">
          WANT TO WATCH IN THEATERS
        </h1>
        <div className="mb-4 mt-5 flex gap-6">
          <Link
            href="/me/want-list?tab=films"
            className={[
              TAB_CLASS,
              activeTab === 'films'
                ? 'border-text-primary text-text-primary'
                : 'border-transparent text-text-dim hover:text-text-primary',
            ].join(' ')}
          >
            FILMS
          </Link>
          <Link
            href="/me/want-list?tab=directors"
            className={[
              TAB_CLASS,
              activeTab === 'directors'
                ? 'border-text-primary text-text-primary'
                : 'border-transparent text-text-dim hover:text-text-primary',
            ].join(' ')}
          >
            DIRECTORS
          </Link>
        </div>
        <p className="m-0 text-[0.98rem] leading-[1.6] text-text-secondary">
          {activeTab === 'films'
            ? getHeadline(filmData.totalCount, filmData.onScreenNowCount)
            : getDirectorHeadline(directorData.totalCount, directorData.onScreenNowCount)}
        </p>
      </section>

      {activeTab === 'films' ? (
        filmData.items.length > 0 ? (
        <div className="flex flex-col gap-6">
          {filmData.items.map((item) => {
            const posterIsTmdb = isTmdbPoster(item.movie.posterUrl)
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
      ) : (
        <div className="rounded-panel border border-border-default bg-card-bg p-6 shadow-card">
          <p className="m-0 text-[0.95rem] leading-[1.6] text-text-secondary">
            You have not added any films to Want to watch in theaters yet.
          </p>
        </div>
      )
      ) : directorData.items.length > 0 ? (
        <div className="flex flex-col gap-6">
          {directorData.items.map((item) => (
            <article
              key={item.person.id}
              className="flex flex-wrap items-start gap-6 rounded-panel border border-border-default bg-card-bg p-5 shadow-card"
            >
              <Link
                href={`/people/${item.person.id}`}
                className="shrink-0 text-inherit no-underline"
              >
                <div className={DIRECTOR_PHOTO_CLASS}>
                  <PersonPhotoImage
                    src={item.person.photoUrl || ''}
                    alt={item.person.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              </Link>

              <div className="min-w-[260px] flex-1">
                <h2 className="mb-2 text-[1.7rem] font-black leading-[1.08]">
                  <Link
                    href={`/people/${item.person.id}`}
                    className="text-text-primary no-underline"
                  >
                    {item.person.name.toUpperCase()}
                  </Link>
                </h2>

                <DirectorListActions
                  personId={item.person.id}
                  initialInWant
                  className="mb-4"
                />

                {item.onScreenMovies.length > 0 ? (
                  <div className="rounded-panel border border-border-default bg-page-bg px-4 py-3">
                    <p className="mb-3 text-[0.72rem] font-semibold tracking-[0.1em] text-accent-positive">
                      FILMS ON SCREEN NOW
                    </p>
                    <div className="flex flex-col gap-3">
                      {item.onScreenMovies.map((movie) => {
                        const nextShowtime = movie.showtimes[0]

                        return (
                          <div key={movie.id}>
                            <p className="m-0 text-[0.92rem] font-semibold leading-[1.5] text-text-primary">
                              <Link
                                href={`/films/${movie.id}`}
                                className="text-text-primary no-underline"
                              >
                                {movie.title}
                              </Link>
                            </p>
                            {nextShowtime ? (
                              <p className="m-0 text-[0.84rem] leading-[1.6] text-text-body">
                                Next showtime:{' '}
                                {formatDateKeyInAppTimezone(
                                  getDateKeyInAppTimezone(nextShowtime.startTime)
                                )}{' '}
                                at {formatTimeInAppTimezone(nextShowtime.startTime)} at{' '}
                                {nextShowtime.theater.name}.
                              </p>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="m-0 text-[0.88rem] leading-[1.6] text-text-dim">
                    No films by this director are currently on screen in NYC.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-panel border border-border-default bg-card-bg p-6 shadow-card">
          <p className="m-0 text-[0.95rem] leading-[1.6] text-text-secondary">
            You have not added any directors to your want list yet.
          </p>
        </div>
      )}
    </main>
  )
}
