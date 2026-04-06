// app/(browse)/map/page.tsx
import MapPageClient from '@/components/map/MapPageClient'
import { connection } from 'next/server'
import { getMapTheaters } from '@/lib/cache/public-data'

export default async function MapPage() {
  await connection()

  const theaters = await getMapTheaters()

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <MapPageClient theaters={theaters} />
    </main>
  )
}
