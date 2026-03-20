// components/map/UserLocationMarker.tsx

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Marker, Tooltip, useMapEvents } from 'react-leaflet'
import { createEmojiIcon } from './icons'

export default function UserLocationMarker({
  iconSize,
  onLocationChange,
}: {
  iconSize: number
  onLocationChange?: (pos: [number, number]) => void
}) {
  const [position, setPosition] = useState<[number, number] | null>(null)

  const userIcon = useMemo(() => {
    return createEmojiIcon(
      '😆',
      iconSize,
      'filter: drop-shadow(0 0 10px rgba(255,255,255,0.95));'
    )
  }, [iconSize])

  const map = useMapEvents({
    locationfound(e) {
      const nextPos: [number, number] = [e.latlng.lat, e.latlng.lng]
      setPosition(nextPos)
      onLocationChange?.(nextPos)
    },
    locationerror(e) {
      console.log('Location failed:', e.message)
    },
  })

  useEffect(() => {
    map.locate({
      setView: false,
      enableHighAccuracy: true,
      maxZoom: 14,
    })
  }, [map])

  if (!position) return null

  return (
    <Marker position={position} icon={userIcon}>
      <Tooltip direction="top" offset={[0, -10]} opacity={1}>
        You are here
      </Tooltip>
    </Marker>
  )
}

