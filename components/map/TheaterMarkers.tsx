// components/map/TheaterMarkers.tsx

'use client'

import { useMemo } from 'react'
import { Marker, Tooltip } from 'react-leaflet'
import { useRouter } from 'next/navigation'
import { createEmojiIcon } from './icons'
import type { TheaterForMap } from './types'

export default function TheaterMarkers({
  theaters,
  iconSize,
}: {
  theaters: TheaterForMap[]
  iconSize: number
}) {
  const router = useRouter()

  const theaterIcon = useMemo(() => {
    return createEmojiIcon(
      '🎬',
      iconSize,
      'filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35));'
    )
  }, [iconSize])

  return (
    <>
      {theaters.map((theater) => (
        <Marker
          key={theater.id}
          position={[theater.latitude, theater.longitude]}
          icon={theaterIcon}
          eventHandlers={{
            click: () => {
              const today = new Date().toISOString().split('T')[0]
              router.push(`/date?date=${today}&theaters=${theater.slug}`)
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            {theater.name}
          </Tooltip>
        </Marker>
      ))}
    </>
  )
}