import { prisma } from '../../prisma'

export async function getIngestTableCounts() {
  const [
    theaterCount,
    movieCount,
    formatCount,
    showtimeCount,
    scheduledShowtimeCount,
    canceledShowtimeCount,
  ] = await Promise.all([
    prisma.theater.count(),
    prisma.movie.count(),
    prisma.format.count(),
    prisma.showtime.count(),
    prisma.showtime.count({
      where: {
        status: 'SCHEDULED',
      },
    }),
    prisma.showtime.count({
      where: {
        status: 'CANCELED',
      },
    }),
  ])

  return {
    theaterCount,
    movieCount,
    formatCount,
    showtimeCount,
    scheduledShowtimeCount,
    canceledShowtimeCount,
  }
}

export async function backfillMissingShowtimeEndTimesBatch(batchSize = 500): Promise<number> {
  const rows = await prisma.showtime.findMany({
    where: {
      endTime: null,
      OR: [
        {
          runtimeMinutes: {
            gt: 0,
          },
        },
        {
          movie: {
            runtimeMinutes: {
              gt: 0,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      startTime: true,
      runtimeMinutes: true,
      movie: {
        select: {
          runtimeMinutes: true,
        },
      },
    },
    orderBy: {
      id: 'asc',
    },
    take: batchSize,
  })

  if (rows.length === 0) return 0

  let updatedCount = 0

  for (const row of rows) {
    const runtimeMinutes = row.runtimeMinutes ?? row.movie.runtimeMinutes
    if (!runtimeMinutes || runtimeMinutes <= 0) continue

    const endTime = new Date(row.startTime.getTime() + runtimeMinutes * 60 * 1000)
    await prisma.showtime.update({
      where: { id: row.id },
      data: { endTime },
    })
    updatedCount += 1
  }

  return updatedCount
}

export async function deleteExpiredShowtimesBatch(batchSize = 1000): Promise<number> {
  const now = new Date()

  const rows = await prisma.showtime.findMany({
    where: {
      OR: [
        {
          endTime: {
            lt: now,
          },
        },
        {
          endTime: null,
          startTime: {
            lt: now,
          },
        },
      ],
    },
    select: {
      id: true,
    },
    orderBy: {
      startTime: 'asc',
    },
    take: batchSize,
  })

  if (rows.length === 0) return 0

  const deleted = await prisma.showtime.deleteMany({
    where: {
      id: {
        in: rows.map((row) => row.id),
      },
    },
  })

  return deleted.count
}

export async function disconnectPrisma() {
  await prisma.$disconnect()
}
