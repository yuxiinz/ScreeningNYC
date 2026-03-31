import 'dotenv/config'

import { prisma } from '@/lib/prisma'

async function main() {
  const deletedCastLinks = await prisma.moviePerson.deleteMany({
    where: {
      kind: 'CAST',
    },
  })

  const deletedUnmatchedPeople = await prisma.person.deleteMany({
    where: {
      tmdbId: null,
    },
  })

  const deletedNonDirectorPeople = await prisma.person.deleteMany({
    where: {
      movieLinks: {
        none: {
          kind: 'DIRECTOR',
        },
      },
    },
  })

  console.log(
    `[cleanup_directors] deleted cast links=${deletedCastLinks.count} unmatched people=${deletedUnmatchedPeople.count} non-director people=${deletedNonDirectorPeople.count}`
  )
}

main()
  .catch((error) => {
    console.error('[cleanup_directors] fatal error', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
