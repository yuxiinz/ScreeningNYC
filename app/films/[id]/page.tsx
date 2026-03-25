// app/films/[id]/page.tsx

import { notFound } from 'next/navigation'

import BackButton from '@/components/BackButton'
import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import PosterImage from '@/components/movie/PosterImage'
import {
  cleanDirectorText,
  getReleaseYear,
  isTmdbPoster,
} from '@/lib/movie/display'
import { prisma } from '@/lib/prisma'
import { isFreeTicketValue } from '@/lib/showtime/ticket'
import {
  formatDateKeyInAppTimezone,
  formatTimeInAppTimezone,
  getDateKeyInAppTimezone,
} from '@/lib/timezone'

export const dynamic = 'force-dynamic'

const SHOWTIME_ROW_CLASS =
  'flex flex-wrap items-start justify-between gap-4 rounded-panel border border-border-default bg-card-bg px-5 py-[15px]'
const SHOWTIME_META_CLASS = 'flex flex-wrap items-baseline gap-5'

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

  const movie = await prisma.movie.findUnique({
    where: { id: parseInt(id, 10) },
    include: {
      showtimes: {
        select: {
          id: true,
          startTime: true,
          runtimeMinutes: true,
          ticketUrl: true,
          shownTitle: true,
          theater: true,
          format: true,
        },
        where: {
          startTime: {
            gt: new Date(),
          },
          status: 'SCHEDULED',
        },
        orderBy: { startTime: 'asc' },
      },
    },
  })

  if (!movie) return notFound()

  const groupedByDate: Record<string, typeof movie.showtimes> = {}

  movie.showtimes.forEach(showtime => {
    const date = getDateKeyInAppTimezone(showtime.startTime)
    if (!groupedByDate[date]) groupedByDate[date] = []
    groupedByDate[date].push(showtime)
  })

  const posterIsTmdb = isTmdbPoster(movie.posterUrl)
  const director = cleanDirectorText(movie.directorText)
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
              <PosterImage
                src={movie.posterUrl}
                alt={movie.title}
                className={getPosterImageClass(posterIsTmdb)}
              />
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
              Directed by {director}
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
                  {showtimes.map(showtime => (
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

                          <span className="text-[0.9rem] text-text-muted">
                            {showtime.theater.name.toUpperCase()}
                          </span>

                          {(showtime.runtimeMinutes || movie.runtimeMinutes) && (
                            <span className="text-[0.85rem] text-text-dim">
                              {showtime.runtimeMinutes || movie.runtimeMinutes} MIN
                            </span>
                          )}

                          {(showtime.format?.name || displayFormat) && (
                            <span className="text-[0.85rem] text-text-dim">
                              {(showtime.format?.name || displayFormat).toUpperCase()}
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
                          className="whitespace-nowrap border-b border-text-primary text-[0.8rem] text-text-primary opacity-75 no-underline"
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
            ))
          ) : (
            <p className="text-text-empty">No upcoming showtimes available.</p>
          )}
        </section>
      </main>
    </div>
  )
}
