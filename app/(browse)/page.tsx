// app/(browse)/page.tsx

import TheaterFilter from '@/components/TheaterFilter'
import MovieExternalLinks from '@/components/movie/MovieExternalLinks'
import { prisma } from '@/lib/prisma'
import {
  cleanDirectorText,
  getReleaseYear,
  isTmdbPoster,
} from '@/lib/movie/display'
import Link from 'next/link'
import FilmSearchBox from '@/components/FilmSearchBox'

export const dynamic = 'force-dynamic'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ theaters?: string }>
}) {
  const params = await searchParams
  const selectedTheaterSlugs = (params.theaters || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const now = new Date()

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
      (t: (typeof allTheaters)[number]): t is (typeof allTheaters)[number] & { slug: string } =>
        !!t.slug
    )
    .filter((t: (typeof allTheaters)[number] & { slug: string }) => selectedTheaterSlugs.includes(t.slug))
    .map((t: (typeof allTheaters)[number] & { slug: string }) => t.name)

  const movies = await prisma.movie.findMany({
    where: {
      showtimes: {
        some: {
          startTime: {
            gt: now,
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
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  })

  const filmCount = movies.length

  const subtitle =
    selectedTheaterNames.length > 0
      ? `Now you can watch ${filmCount} scheduled film${filmCount === 1 ? '' : 's'} in cinema at ${selectedTheaterNames.join(', ')}.`
      : `Now you can watch ${filmCount} scheduled film${filmCount === 1 ? '' : 's'} in cinema at NYC.`

  return (
    <>
      <div
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <FilmSearchBox />
      </div>

      <main
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
        }}
      >
        <div style={{ marginBottom: '28px' }}>
          <TheaterFilter
            theaters={allTheaters
              .filter((t: (typeof allTheaters)[number]): t is typeof t & { slug: string } => !!t.slug)
              .map((t: (typeof allTheaters)[number] & { slug: string }) => ({
                slug: t.slug,
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
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '28px',
          }}
        >
          {movies.map((movie: (typeof movies)[number]) => {
            const year = getReleaseYear(movie.releaseDate)
            const posterIsTmdb = isTmdbPoster(movie.posterUrl)
            const director = cleanDirectorText(
              movie.directorText,
              'UNKNOWN DIRECTOR'
            )

            return (
              <div
                key={movie.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Link
                  href={`/films/${movie.id}`}
                  style={{
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'block',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '2 / 3',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: '#111',
                      marginBottom: '12px',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
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

                  <div style={{ padding: '0 2px' }}>
                    <h3
                      style={{
                        fontSize: '0.95rem',
                        margin: '0 0 8px 0',
                        fontWeight: '700',
                        lineHeight: '1.25',
                        textTransform: 'uppercase',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        minHeight: '2.5em',
                      }}
                    >
                      {movie.title}
                    </h3>

                    <p
                      style={{
                        fontSize: '0.78rem',
                        color: '#b0b0b0',
                        margin: '0 0 4px 0',
                        lineHeight: '1.35',
                        textTransform: 'none',
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        minHeight: '1.35em',
                      }}
                    >
                      {director}
                    </p>

                    <p
                      style={{
                        fontSize: '0.76rem',
                        color: '#7d7d7d',
                        margin: 0,
                        lineHeight: '1.35',
                        minHeight: '1.35em',
                      }}
                    >
                      {year ?? ''}
                    </p>
                  </div>
                </Link>

                <MovieExternalLinks
                  imdbUrl={movie.imdbUrl}
                  doubanUrl={movie.doubanUrl}
                  letterboxdUrl={movie.letterboxdUrl}
                  size="sm"
                  style={{
                    marginTop: '12px',
                    padding: '0 2px',
                    fontSize: '0.68rem',
                    fontWeight: 'bold',
                  }}
                />
              </div>
            )
          })}
        </div>
      </main>

      <footer style={{ height: '100px' }} />
    </>
  )
}
