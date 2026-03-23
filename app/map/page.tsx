// app/map/page.tsx
import { prisma } from '@/lib/prisma'
import Header from '@/components/Header'
import MapPageClient from '@/components/map/MapPageClient'

export const dynamic = "force-dynamic"

export default async function MapPage() {
  const rawTheaters = await prisma.theater.findMany();

const theaters = rawTheaters
  .filter(
    (
      t: typeof rawTheaters[number]
    ): t is typeof t & {
      latitude: NonNullable<typeof t.latitude>;
      longitude: NonNullable<typeof t.longitude>;
    } => t.latitude !== null && t.longitude !== null
  )
  .map((t: typeof rawTheaters[number] & {
    latitude: NonNullable<typeof rawTheaters[number]['latitude']>;
    longitude: NonNullable<typeof rawTheaters[number]['longitude']>;
  }) => ({
    ...t,
    latitude: Number(t.latitude),
    longitude: Number(t.longitude),
  }));

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