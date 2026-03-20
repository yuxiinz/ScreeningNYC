// app/map/page.tsx
import { prisma } from "@/lib/prisma";
import MapClientWrapper from "@/components/MapClientWrapper";
import Header from '@/components/Header'

export default async function MapPage() {
  const rawTheaters = await prisma.theater.findMany();

  const theaters = rawTheaters
    .filter(t => t.latitude != null && t.longitude != null)
    .map(t => ({
      ...t,
      latitude: Number(t.latitude),
      longitude: Number(t.longitude),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

  return (
    <div style={{ backgroundColor: '#0a0a0a', color: '#fff', minHeight: '100vh', padding: '40px 20px' }}>
      <Header />

      <main style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.5rem' }}>THEATERS NEAR YOU</h2>
          <p style={{ color: '#666' }}>Click on a marker to see theater details and showtimes.</p>
        </div>

        <MapClientWrapper theaters={theaters} />
      </main>
    </div>
  );
}