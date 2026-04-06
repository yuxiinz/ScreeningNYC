// app/(browse)/date/page.tsx

import Link from 'next/link'

import BackToTopButton from '@/components/BackToTopButton'
import DateSelector from '@/components/DateSelector'
import PosterImage from '@/components/movie/PosterImage'
import ShowtimeRow from '@/components/showtime/ShowtimeRow'
import TheaterFilter from '@/components/TheaterFilter'
import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import {
  getCachedDateShowtimes,
  getCachedTheaterDirectory,
} from '@/lib/cache/public-data'
import {
  cleanDirectorText,
} from '@/lib/movie/display'
import {
  getFirstSearchParamValue,
  parseTheaterSlugs,
} from '@/lib/routing/search-params'
import {
  APP_TIMEZONE,
  getTodayInAppTimezone,
} from '@/lib/timezone'
import { DateTime } from 'luxon'

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
  const selectedTheaterSlugs = [...new Set(parseTheaterSlugs(params.theaters))].sort()
  const [allTheaters, showtimes] = await Promise.all([
    getCachedTheaterDirectory(),
    getCachedDateShowtimes({
      selectedTheaterSlugs,
      targetDate,
      todayKey: today,
    }),
  ])

  const theatersWithSlug = allTheaters.filter(
    (
      theater: (typeof allTheaters)[number]
    ): theater is (typeof allTheaters)[number] & { slug: string } =>
      theater.slug !== null
  )

  const selectedTheaterNames = theatersWithSlug
    .filter(theater => selectedTheaterSlugs.includes(theater.slug))
    .map(theater => theater.name)

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
                        <PosterImage src={movie.posterUrl} alt={movie.title} />
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
                        <ShowtimeRow
                          key={showtime.id}
                          movieTitle={movie.title}
                          showtime={showtime}
                          fallbackRuntimeMinutes={movie.runtimeMinutes}
                          theaterClassName="text-[0.9rem] tracking-[0.5px] text-text-muted"
                          ticketLinkClassName="whitespace-nowrap border-b border-text-primary pb-0.5 text-[0.8rem] text-text-primary opacity-75 no-underline"
                        />
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

      <BackToTopButton />
      <footer className="h-[100px]" />
    </>
  )
}
