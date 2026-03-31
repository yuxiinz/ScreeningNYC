import 'dotenv/config'

import {
  buildDirectorPeopleInputsFromText,
  syncMoviePeople,
  syncMoviePeopleFromTmdbId,
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
          OR: [
            {
              tmdbId: {
                not: null,
              },
            },
            {
              directorText: {
                not: null,
              },
            },
          ],
          peopleLinks: {
            none: {},
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      tmdbId: true,
      directorText: true,
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
        await syncMoviePeopleFromTmdbId(movie.id, movie.tmdbId)
      } else if (movie.directorText) {
        await syncMoviePeople(
          movie.id,
          buildDirectorPeopleInputsFromText(movie.directorText),
          {
            replaceKinds: ['DIRECTOR'],
          }
        )
      }

      syncedCount += 1
      console.log(
        `[backfill_people] synced movie ${movie.id}: ${movie.title}${movie.tmdbId ? ` (tmdb ${movie.tmdbId})` : ''}`
      )
    } catch (error) {
      failedCount += 1

      if (error instanceof TmdbApiKeyMissingError) {
        console.warn(
          `[backfill_people] skipped TMDB sync for movie ${movie.id}: TMDB_API_KEY is not configured`
        )
        continue
      }

      console.error(
        `[backfill_people] failed movie ${movie.id}: ${movie.title}`,
        error
      )
    }
  }

  console.log(
    `[backfill_people] completed. synced=${syncedCount} failed=${failedCount}`
  )
}

main()
  .catch((error) => {
    console.error('[backfill_people] fatal error', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
