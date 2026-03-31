import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { fetchTmdbMoviePeople } from '@/lib/people/tmdb'
import type { MoviePersonSyncInput } from '@/lib/people/types'
import { normalizeWhitespace } from '@/lib/ingest/core/text'

function slugifyTagName(name: string) {
  return normalizeWhitespace(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseCommaSeparatedValues(value?: string | null) {
  if (!value) return []

  return value
    .split(',')
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean)
}

function dedupePeople(inputs: MoviePersonSyncInput[]) {
  const deduped = new Map<string, MoviePersonSyncInput>()

  inputs.forEach((input) => {
    const name = normalizeWhitespace(input.name)
    if (!name) return

    const key = `${input.kind}:${input.tmdbId ?? name.toLowerCase()}`
    const existing = deduped.get(key)

    if (!existing) {
      deduped.set(key, {
        ...input,
        name,
      })
      return
    }

    deduped.set(key, {
      ...existing,
      name,
      gender: input.gender ?? existing.gender,
      billingOrder: input.billingOrder ?? existing.billingOrder,
    })
  })

  return [...deduped.values()]
}

async function getOrCreatePersonId(input: MoviePersonSyncInput) {
  const name = normalizeWhitespace(input.name)

  if (!name) {
    return null
  }

  if (input.tmdbId) {
    const existingByTmdbId = await prisma.person.findUnique({
      where: {
        tmdbId: input.tmdbId,
      },
      select: {
        id: true,
      },
    })

    if (existingByTmdbId) {
      await prisma.person.update({
        where: {
          id: existingByTmdbId.id,
        },
        data: {
          name,
          ...(input.gender !== undefined ? { gender: input.gender ?? null } : {}),
        },
      })

      return existingByTmdbId.id
    }

    const existingLocalMatch = await prisma.person.findFirst({
      where: {
        tmdbId: null,
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
      },
    })

    if (existingLocalMatch) {
      await prisma.person.update({
        where: {
          id: existingLocalMatch.id,
        },
        data: {
          tmdbId: input.tmdbId,
          name,
          ...(input.gender !== undefined ? { gender: input.gender ?? null } : {}),
        },
      })

      return existingLocalMatch.id
    }

    try {
      const created = await prisma.person.create({
        data: {
          tmdbId: input.tmdbId,
          name,
          ...(input.gender !== undefined ? { gender: input.gender ?? null } : {}),
        },
        select: {
          id: true,
        },
      })

      return created.id
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await prisma.person.findUnique({
          where: {
            tmdbId: input.tmdbId,
          },
          select: {
            id: true,
          },
        })

        if (existing) {
          return existing.id
        }
      }

      throw error
    }
  }

  const existingByName = await prisma.person.findFirst({
    where: {
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  })

  if (existingByName) {
    return existingByName.id
  }

  const created = await prisma.person.create({
    data: {
      name,
      ...(input.gender !== undefined ? { gender: input.gender ?? null } : {}),
    },
    select: {
      id: true,
    },
  })

  return created.id
}

export async function syncMoviePeople(
  movieId: number,
  inputs: MoviePersonSyncInput[],
  {
    replaceKinds,
  }: {
    replaceKinds?: Array<MoviePersonSyncInput['kind']>
  } = {}
) {
  const people = dedupePeople(inputs)
  const kindsToReplace = replaceKinds || [...new Set(people.map((person) => person.kind))]

  if (!kindsToReplace.length) {
    return
  }

  const rows: Array<{
    movieId: number
    personId: number
    kind: MoviePersonSyncInput['kind']
    billingOrder: number | null
  }> = []
  const personIdCache = new Map<string, number>()

  for (const input of people) {
    const personKey = input.tmdbId
      ? `tmdb:${input.tmdbId}`
      : `name:${normalizeWhitespace(input.name).toLowerCase()}`

    let personId = personIdCache.get(personKey)

    if (!personId) {
      personId = await getOrCreatePersonId(input) || undefined
      if (personId) {
        personIdCache.set(personKey, personId)
      }
    }

    if (!personId) {
      continue
    }

    rows.push({
      movieId,
      personId,
      kind: input.kind,
      billingOrder: input.billingOrder ?? null,
    })
  }

  await prisma.$transaction([
    prisma.moviePerson.deleteMany({
      where: {
        movieId,
        kind: {
          in: kindsToReplace,
        },
      },
    }),
    ...(rows.length > 0
      ? [
          prisma.moviePerson.createMany({
            data: rows,
            skipDuplicates: true,
          }),
        ]
      : []),
  ])
}

export async function syncMoviePeopleFromTmdbId(movieId: number, tmdbId: number) {
  const people = await fetchTmdbMoviePeople(tmdbId)
  await syncMoviePeople(movieId, people, {
    replaceKinds: ['DIRECTOR'],
  })
}

export async function syncMovieTags(movieId: number, genresText?: string | null) {
  const tagNames = parseCommaSeparatedValues(genresText)
  const tags = tagNames
    .map((name) => ({
      name,
      slug: slugifyTagName(name),
    }))
    .filter((tag) => tag.slug)

  if (!tags.length) {
    return
  }

  await prisma.tag.createMany({
    data: tags,
    skipDuplicates: true,
  })

  const persistedTags = await prisma.tag.findMany({
    where: {
      slug: {
        in: tags.map((tag) => tag.slug),
      },
    },
    select: {
      id: true,
    },
  })

  await prisma.$transaction([
    prisma.movieTag.deleteMany({
      where: {
        movieId,
      },
    }),
    prisma.movieTag.createMany({
      data: persistedTags.map((tag) => ({
        movieId,
        tagId: tag.id,
      })),
      skipDuplicates: true,
    }),
  ])
}
