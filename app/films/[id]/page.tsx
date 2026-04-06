// app/films/[id]/page.tsx

import Link from 'next/link'
import { notFound } from 'next/navigation'

import BackButton from '@/components/BackButton'
import MovieListActions from '@/components/movie/MovieListActions'
import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import PosterImage from '@/components/movie/PosterImage'
import ShowtimeRow, {
  type ShowtimeRowItem,
} from '@/components/showtime/ShowtimeRow'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import {
  getCachedMovieDetail,
  getMovieDirectorPeople,
} from '@/lib/cache/public-data'
import {
  cleanDirectorText,
  getReleaseYear,
} from '@/lib/movie/display'
import { syncMoviePeopleFromTmdbId } from '@/lib/movie/relations'
import { TmdbApiKeyMissingError } from '@/lib/tmdb/client'
import { getMovieStatesForUser } from '@/lib/user-movies/service'
import {
  formatDateKeyInAppTimezone,
  getDateKeyInAppTimezone,
  getTodayInAppTimezone,
} from '@/lib/timezone'

type MovieDetailShowtime = ShowtimeRowItem

function extractMetaFromOverview(input?: string | null) {
  const text = (input || '').replace(/\s+/g, ' ').trim()
  if (!text) {
    return {
      metaLine: '',
      body: '',
      inferredFormat: '',
    }
  }

  const yearMatch = text.match(/\b(18|19|20)\d{2}\b/)
  const runtimeMatch = text.match(/(\d+)\s*min\.?/i)
  const formatMatch = text.match(/\b(4K DCP|DCP|35MM|70MM|IMAX|DIGITAL)\b/i)

  const year = yearMatch?.[0] || ''
  const runtime = runtimeMatch ? `${runtimeMatch[1]}min` : ''
  const inferredFormat = formatMatch?.[1] || ''

  const metaParts = [year, runtime, inferredFormat].filter(Boolean)
  const metaLine = metaParts.join(' / ')

  let body = text

  if (yearMatch && typeof yearMatch.index === 'number') {
    const start = yearMatch.index
    let end = text.length

    if (formatMatch && typeof formatMatch.index === 'number') {
      end = formatMatch.index + formatMatch[0].length
    } else if (runtimeMatch && typeof runtimeMatch.index === 'number') {
      end = runtimeMatch.index + runtimeMatch[0].length
    }

    const before = text.slice(0, start).trim()
    const after = text.slice(end).trim()

    if (before && after) {
      body = after
    }
  }

  return {
    metaLine,
    body,
    inferredFormat,
  }
}

export default async function MovieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const currentUserIdPromise = getCurrentUserId()
  const movieId = parseInt(id, 10)

  if (!Number.isInteger(movieId) || movieId <= 0) {
    notFound()
  }

  const todayKey = getTodayInAppTimezone()
  const movie = await getCachedMovieDetail(movieId, todayKey)

  if (!movie) return notFound()

  let peopleLinks = await getMovieDirectorPeople(movieId)

  if (movie.tmdbId && peopleLinks.length === 0) {
    try {
      await syncMoviePeopleFromTmdbId(movie.id, movie.tmdbId)
      peopleLinks = await getMovieDirectorPeople(movieId)
    } catch (error) {
      if (!(error instanceof TmdbApiKeyMissingError)) {
        throw error
      }
    }
  }

  const currentUserId = await currentUserIdPromise
  const movieStates = await getMovieStatesForUser(currentUserId, [movie.id])
  const movieState = movieStates.get(movie.id) || {
    inWant: false,
    inWatched: false,
  }

  const groupedByDate: Record<string, MovieDetailShowtime[]> = {}

  movie.showtimes.forEach((showtime: MovieDetailShowtime) => {
    const date = getDateKeyInAppTimezone(showtime.startTime)
    if (!groupedByDate[date]) groupedByDate[date] = []
    groupedByDate[date].push(showtime)
  })

  const director = cleanDirectorText(movie.directorText)
  const directorPeople = peopleLinks.map((link) => link.person)
  const year = getReleaseYear(movie.releaseDate)
  const overviewMeta = extractMetaFromOverview(movie.overview)
  const displayFormat = overviewMeta.inferredFormat || ''

  return (
    <div className="min-h-screen px-5 py-10">
      <main className="mx-auto max-w-[var(--container-main)]">
        <BackButton />

        <section className="mb-[60px] mt-[30px] flex flex-wrap items-start gap-10">
          <div className="flex aspect-[2/3] w-[320px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-border-subtle bg-card-bg shadow-poster">
            {movie.posterUrl ? (
              <PosterImage src={movie.posterUrl} alt={movie.title} />
            ) : (
              <div className="px-5 text-center text-[0.9rem] text-text-empty">
                No Poster
              </div>
            )}
          </div>

          <div className="min-w-[320px] flex-1">
            <h1 className="m-0 mb-[18px] text-[clamp(2.4rem,6vw,4.2rem)] font-black leading-[1.05] tracking-[0.5px]">
              {movie.title.toUpperCase()}
            </h1>

            <p className="m-0 mb-2.5 text-[1.1rem] leading-[1.5] text-text-secondary">
              Directed by{' '}
              {directorPeople.length > 0
                ? directorPeople.map((person, index) => (
                    <span key={person.id}>
                      {index > 0 ? ', ' : null}
                      <Link
                        href={`/people/${person.id}`}
                        className="border-b border-text-secondary text-text-secondary no-underline transition-colors hover:text-text-primary"
                      >
                        {person.name}
                      </Link>
                    </span>
                  ))
                : director}
            </p>

            {(year || movie.runtimeMinutes || displayFormat) && (
              <p className="m-0 mb-6 text-[1.02rem] leading-[1.5] text-text-detail-meta">
                {[year, movie.runtimeMinutes ? `${movie.runtimeMinutes}min` : '', displayFormat]
                  .filter(Boolean)
                  .join(' / ')}
              </p>
            )}

            <MovieExternalLinks
              imdbUrl={movie.imdbUrl}
              doubanUrl={movie.doubanUrl}
              letterboxdUrl={movie.letterboxdUrl}
              size="md"
              className="mb-7 text-[0.85rem] font-bold"
            />

            {currentUserId ? (
              <MovieListActions
                movieId={movie.id}
                initialInWant={movieState.inWant}
                initialInWatched={movieState.inWatched}
                className="mb-7"
              />
            ) : null}

            <p className="m-0 whitespace-pre-line text-base leading-[1.75] text-text-body">
              {overviewMeta.body || movie.overview || 'No overview available.'}
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-[30px] border-b border-border-strong pb-2.5 text-[1.5rem]">
            SHOWTIMES
          </h2>

          {Object.keys(groupedByDate).length > 0 ? (
            Object.entries(groupedByDate).map(([date, showtimes]) => (
              <div key={date} className="mb-10">
                <h3 className="mb-5 text-[1.1rem] tracking-[1px] text-accent-positive">
                  {formatDateKeyInAppTimezone(date)}
                </h3>

                <div className="flex flex-col gap-2.5">
                  {showtimes.map((showtime: MovieDetailShowtime) => (
                    <ShowtimeRow
                      key={showtime.id}
                      movieTitle={movie.title}
                      showtime={showtime}
                      fallbackRuntimeMinutes={movie.runtimeMinutes}
                      fallbackFormatName={displayFormat}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-text-empty">No upcoming showtimes available.</p>
          )}
        </section>
      </main>
    </div>
  )
}
