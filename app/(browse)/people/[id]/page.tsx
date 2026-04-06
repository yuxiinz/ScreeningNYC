import Link from 'next/link'
import { notFound } from 'next/navigation'

import BackButton from '@/components/BackButton'
import PosterImage from '@/components/movie/PosterImage'
import DirectorListActions from '@/components/person/DirectorListActions'
import {
  cleanDirectorText,
  getReleaseYear,
  isTmdbPoster,
} from '@/lib/movie/display'
import { fetchTmdbDirectorFilmography } from '@/lib/people/tmdb'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import { prisma } from '@/lib/prisma'
import { TmdbApiKeyMissingError } from '@/lib/tmdb/client'
import { getDirectorStatesForUser } from '@/lib/user-directors/service'

const POSTER_CARD_CLASS =
  'mb-3 flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-card-bg shadow-card'

function getPosterImageClass(posterIsTmdb: boolean) {
  return [
    'block h-full w-full bg-card-bg',
    posterIsTmdb ? 'object-cover' : 'object-contain',
  ].join(' ')
}

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const currentUserIdPromise = getCurrentUserId()
  const { id } = await params
  const personId = Number.parseInt(id, 10)

  if (!Number.isInteger(personId) || personId <= 0) {
    notFound()
  }

  const person = await prisma.person.findUnique({
    where: {
      id: personId,
    },
    select: {
      id: true,
      name: true,
      tmdbId: true,
    },
  })

  if (!person) {
    notFound()
  }

  const localMovies = await prisma.movie.findMany({
    where: {
      peopleLinks: {
        some: {
          personId: person.id,
          kind: 'DIRECTOR',
        },
      },
    },
    select: {
      id: true,
      tmdbId: true,
      title: true,
      releaseDate: true,
      posterUrl: true,
      directorText: true,
    },
    orderBy: [
      {
        updatedAt: 'desc',
      },
      {
        title: 'asc',
      },
    ],
  })

  let tmdbUnavailable = false
  let externalMovies: Awaited<ReturnType<typeof fetchTmdbDirectorFilmography>> = []

  if (person.tmdbId) {
    try {
      externalMovies = await fetchTmdbDirectorFilmography(person.tmdbId)
    } catch (error) {
      if (error instanceof TmdbApiKeyMissingError) {
        tmdbUnavailable = true
      } else {
        throw error
      }
    }
  }

  const localTmdbIds = new Set(
    localMovies
      .map((movie) => movie.tmdbId)
      .filter((tmdbId): tmdbId is number => typeof tmdbId === 'number')
  )

  const tmdbOnlyMovies = externalMovies.filter(
    (movie) => !localTmdbIds.has(movie.tmdbId)
  )
  const currentUserId = await currentUserIdPromise
  const directorState = (
    await getDirectorStatesForUser(currentUserId, [person.id])
  ).get(person.id)

  return (
    <main className="mx-auto max-w-[var(--container-wide)]">
      <BackButton />

      <section className="mb-10 mt-8">
        <h1 className="m-0 mb-3 text-[clamp(2rem,5vw,3.4rem)] font-black leading-[1.05] text-text-primary">
          {person.name}
        </h1>

        <p className="m-0 text-[1rem] leading-[1.5] text-text-secondary">
          Director
        </p>

        {currentUserId ? (
          <DirectorListActions
            personId={person.id}
            initialInWant={directorState?.inWant || false}
            className="mt-4"
          />
        ) : null}

        <p className="m-0 mt-3 text-[0.95rem] leading-[1.5] text-text-muted">
          {localMovies.length} directed film{localMovies.length === 1 ? '' : 's'} in
          database
          {tmdbOnlyMovies.length > 0 ? `, plus ${tmdbOnlyMovies.length} from TMDB.` : '.'}
        </p>

        {tmdbUnavailable ? (
          <p className="m-0 mt-2 text-[0.85rem] leading-[1.5] text-text-dim">
            TMDB is not configured, so only local films are shown.
          </p>
        ) : null}
      </section>

      <section className="mb-12">
        <h2 className="mb-5 border-b border-border-strong pb-2.5 text-[1.15rem] font-bold tracking-[0.5px] text-text-primary">
          IN DATABASE
        </h2>

        {localMovies.length > 0 ? (
          <div className="grid gap-7 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {localMovies.map((movie) => {
              const year = getReleaseYear(movie.releaseDate)
              const posterIsTmdb = isTmdbPoster(movie.posterUrl)

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
                        <div className="text-[0.9rem] text-text-empty">No Poster</div>
                      )}
                    </div>

                    <div className="px-0.5">
                      <h3 className="mb-2 min-h-[2.5em] overflow-hidden text-[0.95rem] font-bold leading-[1.25] uppercase [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                        {movie.title}
                      </h3>

                      <p className="mb-1 min-h-[1.35em] overflow-hidden text-[0.78rem] leading-[1.35] text-text-tertiary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1]">
                        {cleanDirectorText(movie.directorText, 'UNKNOWN DIRECTOR')}
                      </p>

                      <p className="m-0 min-h-[1.35em] text-[0.76rem] leading-[1.35] text-text-soft">
                        {year ?? ''}
                      </p>
                    </div>
                  </Link>
                </article>
              )
            })}
          </div>
        ) : (
          <p className="text-text-empty">No local films available.</p>
        )}
      </section>

      {tmdbOnlyMovies.length > 0 ? (
        <section>
          <h2 className="mb-5 border-b border-border-strong pb-2.5 text-[1.15rem] font-bold tracking-[0.5px] text-text-primary">
            MORE DIRECTED FILMS FROM TMDB
          </h2>

          <div className="grid gap-7 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {tmdbOnlyMovies.map((movie) => (
              <article key={movie.tmdbId} className="flex flex-col">
                <Link
                  href={`/films/tmdb/${movie.tmdbId}`}
                  className="block text-inherit no-underline"
                >
                  <div className={POSTER_CARD_CLASS}>
                    {movie.posterUrl ? (
                      <PosterImage
                        src={movie.posterUrl}
                        alt={movie.title}
                        className={getPosterImageClass(true)}
                      />
                    ) : (
                      <div className="text-[0.9rem] text-text-empty">No Poster</div>
                    )}
                  </div>

                  <div className="px-0.5">
                    <h3 className="mb-2 min-h-[2.5em] overflow-hidden text-[0.95rem] font-bold leading-[1.25] uppercase [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {movie.title}
                    </h3>

                    <p className="mb-1 min-h-[1.35em] text-[0.78rem] leading-[1.35] text-text-tertiary">
                      TMDB
                    </p>

                    <p className="m-0 min-h-[1.35em] text-[0.76rem] leading-[1.35] text-text-soft">
                      {movie.year ?? ''}
                    </p>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="h-[100px]" />
    </main>
  )
}
