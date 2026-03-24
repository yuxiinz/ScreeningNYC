// app/date/page.tsx

import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import DateSelector from '@/components/DateSelector'
import TheaterFilter from '@/components/TheaterFilter'
import { DateTime } from 'luxon'
import Header from '@/components/Header'

const TIMEZONE = 'America/New_York'

function isTmdbPoster(url?: string | null) {
  return !!url && url.includes('image.tmdb.org')
}

function formatShowTime(date: Date) {
  return DateTime.fromJSDate(new Date(date))
    .setZone(TIMEZONE)
    .toFormat('HH:mm')
}

function cleanDirectorText(input?: string | null) {
  const text = (input || '').replace(/\s+/g, ' ').trim()
  if (!text) return 'UNKNOWN'

  const withoutDirectedBy = text.replace(/^directed by\s*/i, '').trim()

  const stopPatterns = [
    /\b(18|19|20)\d{2}\b/,
    /\b\d+\s*min\b/i,
    /\b(4k dcp|dcp|35mm|70mm|imax|digital)\b/i,
    /\bthe first\b/i,
    /\bwinner\b/i,
    /\bpresented\b/i,
    /\bproduced by\b/i,
  ]

  let cutIndex = withoutDirectedBy.length

  for (const pattern of stopPatterns) {
    const match = withoutDirectedBy.match(pattern)
    if (match && typeof match.index === 'number') {
      cutIndex = Math.min(cutIndex, match.index)
    }
  }

  const cleaned = withoutDirectedBy.slice(0, cutIndex).trim()
  return cleaned || 'UNKNOWN'
}

function formatReadableDate(targetDate: string) {
  return DateTime.fromISO(targetDate, { zone: TIMEZONE }).toFormat('LLLL d, yyyy')
}

export default async function DatePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; theaters?: string }>
}) {
  const params = await searchParams
  const selectedDateStr = params.date
  const selectedTheaterSlugs = (params.theaters || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const nowNy = DateTime.now().setZone(TIMEZONE)
  const today = nowNy.toFormat('yyyy-MM-dd')
  const targetDate = selectedDateStr || today

  const startOfDayNy = DateTime.fromISO(targetDate, { zone: TIMEZONE }).startOf('day')
  const endOfDayNy = DateTime.fromISO(targetDate, { zone: TIMEZONE }).endOf('day')

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

  const selectedTheaterNames = allTheaters
    .filter(
      (
        t: (typeof allTheaters)[number]
      ) => t.slug !== null && selectedTheaterSlugs.includes(t.slug)
    )
    .map((t: (typeof allTheaters)[number]) => t.name)

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
    include: {
      movie: true,
      theater: true,
      format: true,
    },
    orderBy: {
      startTime: 'asc',
    },
  })

  type ShowtimeItem = typeof showtimes[number]

  type GroupedMovie = ShowtimeItem["movie"] & {
    showtimes: ShowtimeItem[]
  }

  const groupedByMovie: Record<number, GroupedMovie> = {}

  showtimes.forEach((st: ShowtimeItem) => {
    if (!groupedByMovie[st.movieId]) {
      groupedByMovie[st.movieId] = {
        ...st.movie,
        showtimes: [],
      }
    }

  groupedByMovie[st.movieId].showtimes.push(st)
})


  const moviesOnDate = Object.values(groupedByMovie)
    .map((movie: any) => ({
      ...movie,
      showtimes: [...movie.showtimes].sort(
        (a: any, b: any) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      ),
    }))
    .sort((a: any, b: any) => {
      const aFirst = a.showtimes[0]
        ? new Date(a.showtimes[0].startTime).getTime()
        : Number.MAX_SAFE_INTEGER
      const bFirst = b.showtimes[0]
        ? new Date(b.showtimes[0].startTime).getTime()
        : Number.MAX_SAFE_INTEGER
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
    <div
      style={{
        backgroundColor: '#0a0a0a',
        color: '#fff',
        minHeight: '100vh',
        padding: '40px 20px',
      }}
    >
      <Header />

      <main style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <DateSelector currentSafeDate={targetDate} />

        <TheaterFilter
          theaters={allTheaters
            .filter((t: (typeof allTheaters)[number]) => t.slug !== null)
            .map((t: (typeof allTheaters)[number]) => ({
              slug: t.slug as string,
              name: t.name,
            }))}
          selectedTheaters={selectedTheaterSlugs}
        />

        <p
          style={{
            color: '#ffffff',
            fontSize: '0.98rem',
            lineHeight: 1.5,
            margin: '0 0 18px 0',
          }}
        >
          {subtitle}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '60px' }}>
          {moviesOnDate.length > 0 ? (
            moviesOnDate.map((movie: any) => {
              const posterIsTmdb = isTmdbPoster(movie.posterUrl)
              const director = cleanDirectorText(movie.directorText)

              return (
                <section
                  key={movie.id}
                  style={{
                    display: 'flex',
                    gap: '40px',
                    borderBottom: '1px solid #222',
                    paddingBottom: '50px',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <Link
                    href={`/films/${movie.id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div
                      style={{
                        width: '160px',
                        aspectRatio: '2 / 3',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                        border: '1px solid #1f1f1f',
                        backgroundColor: '#111',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {movie.posterUrl ? (
                        <img
                          src={movie.posterUrl}
                          alt={movie.title}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: posterIsTmdb ? 'cover' : 'contain',
                            backgroundColor: '#111',
                            display: 'block',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            color: '#666',
                            fontSize: '0.9rem',
                          }}
                        >
                          No Poster
                        </div>
                      )}
                    </div>
                  </Link>

                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <h2
                      style={{
                        fontSize: '2rem',
                        fontWeight: '900',
                        margin: '0 0 8px 0',
                        lineHeight: '1.1',
                      }}
                    >
                      <Link
                        href={`/films/${movie.id}`}
                        style={{ color: '#fff', textDecoration: 'none' }}
                      >
                        {movie.title.toUpperCase()}
                      </Link>
                    </h2>

                    <p
                      style={{
                        color: '#888',
                        fontSize: '1rem',
                        marginBottom: '20px',
                      }}
                    >
                      DIRECTED BY {director}
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        gap: '12px',
                        marginBottom: '30px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {movie.imdbUrl && (
                        <a
                          href={movie.imdbUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#f5c518',
                            border: '1px solid #f5c518',
                            padding: '3px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            textDecoration: 'none',
                          }}
                        >
                          IMDb ↗
                        </a>
                      )}

                      {movie.doubanUrl && (
                        <a
                          href={movie.doubanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#00b51d',
                            border: '1px solid #00b51d',
                            padding: '3px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            textDecoration: 'none',
                          }}
                        >
                          豆瓣 ↗
                        </a>
                      )}

                      {movie.letterboxdUrl && (
                        <a
                          href={movie.letterboxdUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#ff8000',
                            border: '1px solid #ff8000',
                            padding: '3px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            textDecoration: 'none',
                          }}
                        >
                          LB ↗
                        </a>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      {movie.showtimes.map((st: any) => (
                        <div
                          key={st.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: '#111',
                            padding: '15px 20px',
                            borderRadius: '6px',
                            border: '1px solid #222',
                            gap: '16px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'baseline',
                              gap: '20px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '1.2rem',
                                fontWeight: 'bold',
                                fontFamily: 'monospace',
                              }}
                            >
                              {formatShowTime(st.startTime)}
                            </span>

                            <span
                              style={{
                                color: '#aaa',
                                fontSize: '0.9rem',
                                letterSpacing: '0.5px',
                              }}
                            >
                              {st.theater.name.toUpperCase()}
                            </span>

                            {(st.runtimeMinutes || movie.runtimeMinutes) && (
                              <span
                                style={{
                                  color: '#888',
                                  fontSize: '0.85rem',
                                }}
                              >
                                {st.runtimeMinutes || movie.runtimeMinutes} MIN
                              </span>
                            )}

                            {st.format?.name && (
                              <span
                                style={{
                                  color: '#888',
                                  fontSize: '0.85rem',
                                }}
                              >
                                {st.format.name.toUpperCase()}
                              </span>
                            )}
                          </div>

                          {st.ticketUrl ? (
                            <a
                              href={st.ticketUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#fff',
                                fontSize: '0.8rem',
                                opacity: 0.75,
                                textDecoration: 'none',
                                borderBottom: '1px solid #fff',
                                paddingBottom: '2px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              TICKETS ↗
                            </a>
                          ) : (
                            <span
                              style={{
                                color: '#777',
                                fontSize: '0.8rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
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
            <div
              style={{
                color: '#444',
                textAlign: 'center',
                marginTop: '100px',
                fontSize: '1.2rem',
                letterSpacing: '1px',
              }}
            >
              NO SCREENINGS FOUND FOR THIS DATE.
            </div>
          )}
        </div>
      </main>

      <footer style={{ height: '100px' }} />
    </div>
  )
}