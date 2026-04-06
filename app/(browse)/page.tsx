// app/(browse)/page.tsx

import Link from 'next/link'

import FilmSearchBox from '@/components/FilmSearchBox'
import MovieListActions from '@/components/movie/MovieListActions'
import PosterImage from '@/components/movie/PosterImage'
import TheaterFilter from '@/components/TheaterFilter'
import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import {
  getCachedHomeMovies,
  getCachedTheaterDirectory,
} from '@/lib/cache/public-data'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import {
  cleanDirectorText,
  getReleaseYear,
  isTmdbPoster,
} from '@/lib/movie/display'
import { getTodayInAppTimezone } from '@/lib/timezone'
import { getMovieStatesForUser } from '@/lib/user-movies/service'

const POSTER_CARD_CLASS =
  'mb-3 flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-card-bg shadow-card'
const TITLE_CLASS =
  'mb-2 min-h-[2.5em] overflow-hidden text-[0.95rem] font-bold leading-[1.25] uppercase [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]'
const DIRECTOR_CLASS =
  'mb-1 min-h-[1.35em] overflow-hidden text-[0.78rem] leading-[1.35] text-text-tertiary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1]'

function getPosterImageClass(posterIsTmdb: boolean) {
  return [
    'block h-full w-full bg-card-bg',
    posterIsTmdb ? 'object-cover' : 'object-contain',
  ].join(' ')
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ theaters?: string }>
}) {
  const params = await searchParams
  const selectedTheaterSlugs = [...new Set(
    (params.theaters || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  )].sort()

  const todayKey = getTodayInAppTimezone()
  const [currentUserId, allTheaters, movies] = await Promise.all([
    getCurrentUserId(),
    getCachedTheaterDirectory(),
    getCachedHomeMovies(selectedTheaterSlugs, todayKey),
  ])

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

  const filmCount = movies.length

  const subtitle =
    selectedTheaterNames.length > 0
      ? `Now you can watch ${filmCount} scheduled film${filmCount === 1 ? '' : 's'} in cinema at ${selectedTheaterNames.join(', ')}.`
      : `Now you can watch ${filmCount} scheduled film${filmCount === 1 ? '' : 's'} in cinema at NYC.`

  return (
    <>
      <div className="mx-auto mb-5 flex max-w-[var(--container-wide)] justify-end">
        <FilmSearchBox isAuthenticated={Boolean(currentUserId)} />
      </div>

      <main className="mx-auto max-w-[var(--container-wide)]">
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
        </div>

        <div className="grid gap-7 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {movies.map(movie => {
            const year = getReleaseYear(movie.releaseDate)
            const posterIsTmdb = isTmdbPoster(movie.posterUrl)
            const director = cleanDirectorText(
              movie.directorText,
              'UNKNOWN DIRECTOR'
            )
            const movieState = movieStates.get(movie.id) || {
              inWant: false,
              inWatched: false,
            }

            return (
              <article key={movie.id} className="flex flex-col">
                <Link
                  href={`/films/${movie.id}`}
                  className="block text-inherit no-underline"
                >
                  <div className={POSTER_CARD_CLASS}>
                    {movie.posterUrl ? (
                      <PosterImage
                        src={movie.posterUrl}
                        alt={movie.title}
                        className={getPosterImageClass(posterIsTmdb)}
                      />
                    ) : (
                      <div className="text-[0.9rem] text-text-empty">
                        No Poster
                      </div>
                    )}
                  </div>

                  <div className="px-0.5">
                    <h3 className={TITLE_CLASS}>{movie.title}</h3>

                    <p className={DIRECTOR_CLASS}>{director}</p>

                    <p className="m-0 min-h-[1.35em] text-[0.76rem] leading-[1.35] text-text-soft">
                      {year ?? ''}
                    </p>
                  </div>
                </Link>

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
              </article>
            )
          })}
        </div>
      </main>

      <footer className="h-[100px]" />
    </>
  )
}
