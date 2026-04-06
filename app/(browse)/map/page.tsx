// app/(browse)/map/page.tsx
import MapPageClient from '@/components/map/MapPageClient'
import { getCachedMapTheaters } from '@/lib/cache/public-data'

export default async function MapPage() {
  const theaters = await getCachedMapTheaters()

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <MapPageClient theaters={theaters} />
    </main>
  )
}
