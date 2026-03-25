// app/(browse)/map/page.tsx
import { prisma } from '@/lib/prisma'
import MapPageClient from '@/components/map/MapPageClient'

export const dynamic = 'force-dynamic'

export default async function MapPage() {
  const rawTheaters = await prisma.theater.findMany()

  const theaters = rawTheaters
    .filter(
      (
        theater: typeof rawTheaters[number]
      ): theater is typeof theater & {
        latitude: NonNullable<typeof theater.latitude>
        longitude: NonNullable<typeof theater.longitude>
      } => theater.latitude !== null && theater.longitude !== null
    )
    .map(theater => ({
      ...theater,
      latitude: Number(theater.latitude),
      longitude: Number(theater.longitude),
    }))

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <MapPageClient theaters={theaters} />
    </main>
  )
}
