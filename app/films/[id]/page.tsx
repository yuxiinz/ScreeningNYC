// app/films/[id]/page.tsx

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import BackButton from '@/components/BackButton'
import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import {
  cleanDirectorText,
  getReleaseYear,
  isTmdbPoster,
} from '@/lib/movie/display'
import {
  formatDateKeyInAppTimezone,
  formatTimeInAppTimezone,
  getDateKeyInAppTimezone,
} from '@/lib/timezone'

export const dynamic = 'force-dynamic'

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
    where: { id: parseInt(id) },
    include: {
      showtimes: {
        include: {
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
  movie.showtimes.forEach((st: (typeof movie.showtimes)[number]) => {
    const date = getDateKeyInAppTimezone(st.startTime)
    if (!groupedByDate[date]) groupedByDate[date] = []
    groupedByDate[date].push(st)
  })

  const posterIsTmdb = isTmdbPoster(movie.posterUrl)
  const director = cleanDirectorText(movie.directorText)
  const year = getReleaseYear(movie.releaseDate)
  const overviewMeta = extractMetaFromOverview(movie.overview)
  const displayFormat = overviewMeta.inferredFormat || ''

  return (
    <div
      style={{
        backgroundColor: '#0a0a0a',
        color: '#fff',
        minHeight: '100vh',
        padding: '40px 20px',
      }}
    >
      <main style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <BackButton />

        <section
          style={{
            display: 'flex',
            gap: '40px',
            marginTop: '30px',
            marginBottom: '60px',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              width: '320px',
              aspectRatio: '2 / 3',
              flexShrink: 0,
              borderRadius: '12px',
              overflow: 'hidden',
              backgroundColor: '#111',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              border: '1px solid #1f1f1f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {movie.posterUrl ? (
              <img
                src={movie.posterUrl}
                alt={movie.title}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  objectFit: posterIsTmdb ? 'cover' : 'contain',
                  backgroundColor: '#111',
                }}
              />
            ) : (
              <div
                style={{
                  color: '#666',
                  fontSize: '0.9rem',
                  textAlign: 'center',
                  padding: '20px',
                }}
              >
                No Poster
              </div>
            )}
          </div>

          <div
            style={{
              flex: 1,
              minWidth: '320px',
            }}
          >
            <h1
              style={{
                fontSize: 'clamp(2.4rem, 6vw, 4.2rem)',
                fontWeight: 900,
                margin: '0 0 18px 0',
                lineHeight: 1.05,
                letterSpacing: '0.5px',
              }}
            >
              {movie.title.toUpperCase()}
            </h1>

            <p
              style={{
                color: '#bcbcbc',
                fontSize: '1.1rem',
                margin: '0 0 10px 0',
                lineHeight: 1.5,
              }}
            >
              Directed by {director}
            </p>

            {(year || movie.runtimeMinutes || displayFormat) && (
              <p
                style={{
                  color: '#8f8f8f',
                  fontSize: '1.02rem',
                  margin: '0 0 24px 0',
                  lineHeight: 1.5,
                }}
              >
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
              style={{
                marginBottom: '28px',
                fontSize: '0.85rem',
                fontWeight: 'bold',
              }}
            />

            <p
              style={{
                lineHeight: 1.75,
                color: '#ccc',
                fontSize: '1rem',
                margin: 0,
                whiteSpace: 'pre-line',
              }}
            >
              {overviewMeta.body || movie.overview || 'No overview available.'}
            </p>
          </div>
        </section>

        <section>
          <h2
            style={{
              fontSize: '1.5rem',
              borderBottom: '1px solid #333',
              paddingBottom: '10px',
              marginBottom: '30px',
            }}
          >
            SHOWTIMES
          </h2>

          {Object.keys(groupedByDate).length > 0 ? (
            Object.entries(groupedByDate).map(([date, times]) => (
              <div key={date} style={{ marginBottom: '40px' }}>
                <h3
                  style={{
                    color: '#00b51d',
                    fontSize: '1.1rem',
                    marginBottom: '20px',
                    letterSpacing: '1px',
                  }}
                >
                  {formatDateKeyInAppTimezone(date)}
                </h3>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {times.map((st: (typeof movie.showtimes)[number]) => (
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
                          {formatTimeInAppTimezone(st.startTime)}
                        </span>

                        <span
                          style={{
                            color: '#aaa',
                            fontSize: '0.9rem',
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

                        {(st.format?.name || displayFormat) && (
                          <span
                            style={{
                              color: '#888',
                              fontSize: '0.85rem',
                            }}
                          >
                            {(st.format?.name || displayFormat).toUpperCase()}
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
            ))
          ) : (
            <p style={{ color: '#666', fontStyle: 'italic' }}>
              No upcoming showtimes scheduled.
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
