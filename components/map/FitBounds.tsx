// components/map/FitBounds.tsx

'use client'

import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { TheaterForMap } from './types'

export default function FitBounds({
  theaters,
  userLocation,
}: {
  theaters: TheaterForMap[]
  userLocation: [number, number] | null
}) {
  const map = useMap()

  useEffect(() => {
    const points: [number, number][] = theaters.map((t) => [
      t.latitude,
      t.longitude,
    ])

    if (userLocation) {
      points.push(userLocation)
    }

    if (points.length === 0) return

    if (points.length === 1) {
      map.setView(points[0], 13)
      return
    }

    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, { padding: [60, 60] })
  }, [map, theaters, userLocation])

  return null
}