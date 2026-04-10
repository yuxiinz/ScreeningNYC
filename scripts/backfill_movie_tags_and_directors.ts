import 'dotenv/config'

import {
  syncMovieDirectorsFromTmdbId,
  syncMovieTags,
} from '@/lib/movie/relations'
import { prisma } from '@/lib/prisma'
import { TmdbApiKeyMissingError } from '@/lib/tmdb/client'

async function main() {
  const movies = await prisma.movie.findMany({
    where: {
      OR: [
        {
          genresText: {
            not: null,
          },
          tagLinks: {
            none: {},
          },
        },
        {
          tmdbId: {
            not: null,
          },
          OR: [
            {
              peopleLinks: {
                none: {
                  kind: 'DIRECTOR',
                },
              },
            },
            {
              peopleLinks: {
                some: {
                  kind: 'DIRECTOR',
                  person: {
                    photoUrl: null,
                  },
                },
              },
            },
          ],
        },
        {
          tmdbId: {
            not: null,
          },
          peopleLinks: {
            some: {
              kind: 'DIRECTOR',
            },
          },
          tagLinks: {
            none: {},
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      tmdbId: true,
      genresText: true,
    },
    orderBy: {
      id: 'asc',
    },
  })

  let syncedCount = 0
  let failedCount = 0

  for (const movie of movies) {
    try {
      await syncMovieTags(movie.id, movie.genresText)

      if (movie.tmdbId) {
        await syncMovieDirectorsFromTmdbId(movie.id, movie.tmdbId)
      }

      syncedCount += 1
      console.log(
        `[backfill_movie_tags_and_directors] synced movie ${movie.id}: ${movie.title}${movie.tmdbId ? ` (tmdb ${movie.tmdbId})` : ''}`
      )
    } catch (error) {
      failedCount += 1

      if (error instanceof TmdbApiKeyMissingError) {
        console.warn(
          `[backfill_movie_tags_and_directors] skipped TMDB sync for movie ${movie.id}: TMDB_API_KEY is not configured`
        )
        continue
      }

      console.error(
        `[backfill_movie_tags_and_directors] failed movie ${movie.id}: ${movie.title}`,
        error
      )
    }
  }

  console.log(
    `[backfill_movie_tags_and_directors] completed. synced=${syncedCount} failed=${failedCount}`
  )
}

main()
  .catch((error) => {
    console.error('[backfill_movie_tags_and_directors] fatal error', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
