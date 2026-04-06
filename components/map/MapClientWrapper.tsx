// components/map/MapClientWrapper.tsx

'use client'

import { useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'

import type { TheaterForMap } from './types'
import { getIconSize } from './icons'
import ZoomListener from './ZoomListener'
import FitBounds from './FitBounds'
import UserLocationMarker from './UserLocationMarker'
import TheaterMarkers from './TheaterMarkers'

export default function MapClientWrapper({
  theaters,
}: {
  theaters: TheaterForMap[]
}) {
  const [zoom, setZoom] = useState(12)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)

  const iconSize = getIconSize(zoom)

  return (
    <div
      style={{
        width: '100%',
        height: '70vh',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #222',
      }}
    >
      <MapContainer
        center={[40.72, -74.0]}
        zoom={12}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom
      >
        <ZoomListener onZoomChange={setZoom} />

        <UserLocationMarker
          iconSize={iconSize}
          onLocationChange={setUserLocation}
        />

        <FitBounds theaters={theaters} userLocation={userLocation} />

        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url='https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        />

        <TheaterMarkers theaters={theaters} iconSize={iconSize} />
      </MapContainer>

      <style jsx global>{`
        .custom-emoji-icon {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  )
}
