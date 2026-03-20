// components/map/ZoomListener.tsx

'use client'

import { useEffect } from 'react'
import { useMapEvents } from 'react-leaflet'

export default function ZoomListener({
  onZoomChange,
}: {
  onZoomChange: (zoom: number) => void
}) {
  const map = useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom())
    },
  })

  useEffect(() => {
    onZoomChange(map.getZoom())
  }, [map, onZoomChange])

  return null
}