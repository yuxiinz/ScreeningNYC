// app/(browse)/date/page.tsx

import Link from 'next/link'

import DateSelector from '@/components/DateSelector'
import PosterImage from '@/components/movie/PosterImage'
import TheaterFilter from '@/components/TheaterFilter'
import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import {
  cleanDirectorText,
  isTmdbPoster,
} from '@/lib/movie/display'
import { prisma } from '@/lib/prisma'
import { isFreeTicketValue } from '@/lib/showtime/ticket'
import {
  APP_TIMEZONE,
  formatTimeInAppTimezone,
  getTodayInAppTimezone,
} from '@/lib/timezone'
import { DateTime } from 'luxon'

const SHOWTIME_ROW_CLASS =
  'flex flex-wrap items-start justify-between gap-4 rounded-panel border border-border-default bg-card-bg px-5 py-[15px]'
const SHOWTIME_META_CLASS = 'flex flex-wrap items-baseline gap-5'
const POSTER_CARD_CLASS =
  'flex aspect-[2/3] w-40 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-card-bg shadow-poster'

type DatePageSearchParams = {
  date?: string | string[]
  theaters?: string | string[]
}

function formatReadableDate(targetDate: string) {
  return DateTime.fromISO(targetDate, { zone: APP_TIMEZONE }).toFormat(
    'LLLL d, yyyy'
  )
}

function getPosterImageClass(posterIsTmdb: boolean) {
  return [
    'block h-full w-full bg-card-bg',
    posterIsTmdb ? 'object-cover' : 'object-contain',
  ].join(' ')
}

function getShowtimeDisplayTitle(shownTitle?: string | null, movieTitle?: string | null) {
  const shown = (shownTitle || '').replace(/\s+/g, ' ').trim()
  const movie = (movieTitle || '').replace(/\s+/g, ' ').trim()

  if (!shown) return ''
  if (!movie) return shown
  if (shown.toLowerCase() === movie.toLowerCase()) return ''

  return shown
}

function getFirstSearchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

function parseTheaterSlugs(value?: string | string[]) {
  const rawValues = Array.isArray(value) ? value : value ? [value] : []

  return rawValues
    .flatMap((item) => item.split(','))
    .map((slug) => slug.trim())
    .filter(Boolean)
}

function resolveSafeDate(value: string | string[] | undefined, fallbackDate: string) {
  const rawDate = getFirstSearchParamValue(value)?.trim()
  if (!rawDate) {
    return fallbackDate
  }

  const parsedDate = DateTime.fromISO(rawDate, { zone: APP_TIMEZONE })
  if (!parsedDate.isValid) {
    return fallbackDate
  }

  return parsedDate.toFormat('yyyy-MM-dd')
}

export default async function DatePage({
  searchParams,
}: {
  searchParams: Promise<DatePageSearchParams>
}) {
  const params = await searchParams

  const nowNy = DateTime.now().setZone(APP_TIMEZONE)
  const today = getTodayInAppTimezone(nowNy.toJSDate())
  const targetDate = resolveSafeDate(params.date, today)
  const selectedTheaterSlugs = parseTheaterSlugs(params.theaters)

  const startOfDayNy = DateTime.fromISO(targetDate, {
    zone: APP_TIMEZONE,
  }).startOf('day')
  const endOfDayNy = DateTime.fromISO(targetDate, {
    zone: APP_TIMEZONE,
  }).endOf('day')

  const queryStartNy = startOfDayNy < nowNy ? nowNy : startOfDayNy

  const queryStart = queryStartNy.toUTC().toJSDate()
  const queryEnd = endOfDayNy.toUTC().toJSDate()

  const allTheaters = await prisma.theater.findMany({
    orderBy: {
      name: 'asc',
    },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  })

  const theatersWithSlug = allTheaters.filter(
    (
      theater: (typeof allTheaters)[number]
    ): theater is (typeof allTheaters)[number] & { slug: string } =>
      theater.slug !== null
  )

  const selectedTheaterNames = theatersWithSlug
    .filter(theater => selectedTheaterSlugs.includes(theater.slug))
    .map(theater => theater.name)

  const showtimes = await prisma.showtime.findMany({
    where: {
      startTime: {
        gte: queryStart,
        lte: queryEnd,
      },
      status: 'SCHEDULED',
      ...(selectedTheaterSlugs.length > 0
        ? {
            theater: {
              slug: {
                in: selectedTheaterSlugs,
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      movieId: true,
      startTime: true,
      runtimeMinutes: true,
      ticketUrl: true,
      shownTitle: true,
      movie: true,
      theater: true,
      format: true,
    },
    orderBy: {
      startTime: 'asc',
    },
  })

  type ShowtimeItem = typeof showtimes[number]
  type GroupedMovie = ShowtimeItem['movie'] & {
    showtimes: ShowtimeItem[]
  }

  const groupedByMovie: Record<number, GroupedMovie> = {}

  showtimes.forEach((showtime: ShowtimeItem) => {
    if (!groupedByMovie[showtime.movieId]) {
      groupedByMovie[showtime.movieId] = {
        ...showtime.movie,
        showtimes: [],
      }
    }

    groupedByMovie[showtime.movieId].showtimes.push(showtime)
  })

  const moviesOnDate: GroupedMovie[] = Object.values(groupedByMovie)
    .map(movie => ({
      ...movie,
      showtimes: [...movie.showtimes].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime()
      ),
    }))
    .sort((a, b) => {
      const aFirst =
        a.showtimes[0]?.startTime.getTime() ?? Number.MAX_SAFE_INTEGER
      const bFirst =
        b.showtimes[0]?.startTime.getTime() ?? Number.MAX_SAFE_INTEGER
      return aFirst - bFirst
    })

  const filmCount = moviesOnDate.length

  const subtitle =
    targetDate === today
      ? selectedTheaterNames.length > 0
        ? `There are ${filmCount} film${filmCount === 1 ? '' : 's'} you can watch today at ${selectedTheaterNames.join(', ')}!`
        : `There are ${filmCount} film${filmCount === 1 ? '' : 's'} you can watch today!`
      : selectedTheaterNames.length > 0
        ? `There are ${filmCount} film${filmCount === 1 ? '' : 's'} you can watch on ${formatReadableDate(targetDate)} at ${selectedTheaterNames.join(', ')}!`
        : `There are ${filmCount} film${filmCount === 1 ? '' : 's'} you can watch on ${formatReadableDate(targetDate)}!`

  return (
    <>
      <main className="mx-auto max-w-[var(--container-main)]">
        <DateSelector currentSafeDate={targetDate} />

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

        <div className="flex flex-col gap-[60px]">
          {moviesOnDate.length > 0 ? (
            moviesOnDate.map(movie => {
              const posterIsTmdb = isTmdbPoster(movie.posterUrl)
              const director = cleanDirectorText(movie.directorText, 'UNKNOWN')

              return (
                <section
                  key={movie.id}
                  className="flex flex-wrap items-start gap-10 border-b border-border-default pb-[50px]"
                >
                  <Link
                    href={`/films/${movie.id}`}
                    className="shrink-0 text-inherit no-underline"
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
                  </Link>

                  <div className="min-w-[280px] flex-1">
                    <h2 className="m-0 mb-2 text-[2rem] font-black leading-[1.1]">
                      <Link
                        href={`/films/${movie.id}`}
                        className="text-text-primary no-underline"
                      >
                        {movie.title.toUpperCase()}
                      </Link>
                    </h2>

                    <p className="mb-5 text-base text-text-dim">
                      DIRECTED BY {director}
                    </p>

                    <MovieExternalLinks
                      imdbUrl={movie.imdbUrl}
                      doubanUrl={movie.doubanUrl}
                      letterboxdUrl={movie.letterboxdUrl}
                      size="sm"
                      showExternalIndicator
                      className="mb-[30px] gap-3 text-[11px] font-bold"
                    />

                    <div className="flex flex-col gap-3">
                      {movie.showtimes.map(showtime => (
                        <div key={showtime.id} className={SHOWTIME_ROW_CLASS}>
                          <div className="min-w-0 flex-1">
                            {getShowtimeDisplayTitle(showtime.shownTitle, movie.title) && (
                              <p className="mb-1 text-[0.82rem] leading-[1.4] text-text-soft">
                                {getShowtimeDisplayTitle(showtime.shownTitle, movie.title)}
                              </p>
                            )}

                            <div className={SHOWTIME_META_CLASS}>
                              <span className="font-mono text-[1.2rem] font-bold">
                                {formatTimeInAppTimezone(showtime.startTime)}
                              </span>

                              <span className="text-[0.9rem] tracking-[0.5px] text-text-muted">
                                {showtime.theater.name.toUpperCase()}
                              </span>

                              {(showtime.runtimeMinutes || movie.runtimeMinutes) && (
                                <span className="text-[0.85rem] text-text-dim">
                                  {showtime.runtimeMinutes || movie.runtimeMinutes}{' '}
                                  MIN
                                </span>
                              )}

                              {showtime.format?.name && (
                                <span className="text-[0.85rem] text-text-dim">
                                  {showtime.format.name.toUpperCase()}
                                </span>
                              )}
                            </div>

                          </div>

                          {isFreeTicketValue(showtime.ticketUrl) ? (
                            <span className="whitespace-nowrap text-[0.8rem] font-bold text-accent-positive">
                              FREE
                            </span>
                          ) : showtime.ticketUrl ? (
                            <a
                              href={showtime.ticketUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="whitespace-nowrap border-b border-text-primary pb-0.5 text-[0.8rem] text-text-primary opacity-75 no-underline"
                            >
                              TICKETS ↗
                            </a>
                          ) : (
                            <span className="whitespace-nowrap text-[0.8rem] text-text-disabled">
                              SOLD OUT
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )
            })
          ) : (
            <div className="mt-[100px] text-center text-[1.2rem] tracking-[1px] text-text-faded">
              NO SCREENINGS FOUND FOR THIS DATE.
            </div>
          )}
        </div>
      </main>

      <footer className="h-[100px]" />
    </>
  )
}
