// app/map/page.tsx
import { prisma } from '@/lib/prisma'
import Header from '@/components/Header'
import MapPageClient from '@/components/map/MapPageClient'

export default async function MapPage() {
  const rawTheaters = await prisma.theater.findMany()

  const theaters = rawTheaters.map((t) => ({
    ...t,
    latitude: t.latitude != null ? Number(t.latitude) : null,
    longitude: t.longitude != null ? Number(t.longitude) : null,
  }))

  return (
    <div
      style={{
        backgroundColor: '#0a0a0a',
        color: '#fff',
        minHeight: '100vh',
        padding: '40px 20px',
      }}
    >
      <Header />

      <main style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <MapPageClient theaters={theaters} />
      </main>
    </div>
  )
}