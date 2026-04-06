import type { DirectorSearchResult } from '@/lib/people/search-types'
import { prisma } from '@/lib/prisma'

export async function searchLocalDirectors(
  query: string,
  { take = 8 }: { take?: number } = {}
): Promise<DirectorSearchResult[]> {
  const trimmedQuery = query.trim()

  if (trimmedQuery.length < 2) {
    return []
  }

  const people = await prisma.person.findMany({
    where: {
      name: {
        contains: trimmedQuery,
        mode: 'insensitive',
      },
      movieLinks: {
        some: {
          kind: 'DIRECTOR',
        },
      },
    },
    select: {
      id: true,
      name: true,
      tmdbId: true,
      _count: {
        select: {
          movieLinks: {
            where: {
              kind: 'DIRECTOR',
            },
          },
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
    take,
  })

  return people.map((person) => ({
    id: person.id,
    name: person.name,
    tmdbId: person.tmdbId ?? null,
    filmCount: person._count.movieLinks,
  }))
}
