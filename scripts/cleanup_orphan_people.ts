import 'dotenv/config'

import { prisma } from '@/lib/prisma'

async function main() {
  // Keep CAST data and TMDB-backed directors intact. This cleanup only prunes
  // local placeholder people that are no longer referenced anywhere.
  const deletedOrphanLocalPeople = await prisma.person.deleteMany({
    where: {
      tmdbId: null,
      movieLinks: {
        none: {},
      },
      directorWatchlistItems: {
        none: {},
      },
    },
  })

  console.log(
    `[cleanup_orphan_people] deleted orphan local people=${deletedOrphanLocalPeople.count}; preserved CAST links and TMDB-backed directors`
  )
}

main()
  .catch((error) => {
    console.error('[cleanup_orphan_people] fatal error', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
