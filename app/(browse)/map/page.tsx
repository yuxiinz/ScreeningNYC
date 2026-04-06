// app/(browse)/map/page.tsx
import MapPageClient from '@/components/map/MapPageClient'
import { connection } from 'next/server'
import { getCachedMapTheaters } from '@/lib/cache/public-data'

export default async function MapPage() {
  await connection()

  const theaters = await getCachedMapTheaters()

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <MapPageClient theaters={theaters} />
    </main>
  )
}
