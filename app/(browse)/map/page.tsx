// app/(browse)/map/page.tsx
import MapPageClient from '@/components/map/MapPageClient'
import { connection } from 'next/server'
import { getMapTheaters } from '@/lib/cache/public-data'

export default async function MapPage() {
  // This page has no request-time APIs of its own, so keep connection()
  // to avoid freezing theater data into a prerendered build snapshot.
  await connection()

  const theaters = await getMapTheaters()

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <MapPageClient theaters={theaters} />
    </main>
  )
}
