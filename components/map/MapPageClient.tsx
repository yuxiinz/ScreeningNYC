// components/map/MapPageClient.tsx

'use client'

import dynamic from 'next/dynamic'
import type { TheaterForMap } from './types'

const MapClientWrapper = dynamic(() => import('./MapClientWrapper'), {
  ssr: false,
})

export default function MapPageClient({
  theaters,
}: {
  theaters: TheaterForMap[]
}) {
  return <MapClientWrapper theaters={theaters} />
}