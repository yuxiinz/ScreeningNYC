// components/map/MapPageClient.tsx

'use client'

import { startTransition, useEffect, useState, type ComponentType } from 'react'
import 'leaflet/dist/leaflet.css'

import MapLoadingPlaceholder from './MapLoadingPlaceholder'
import type { TheaterForMap } from './types'

type MapClientWrapperComponent = ComponentType<{
  theaters: TheaterForMap[]
}>

export default function MapPageClient({
  theaters,
}: {
  theaters: TheaterForMap[]
}) {
  const [MapClientWrapper, setMapClientWrapper] =
    useState<MapClientWrapperComponent | null>(null)

  useEffect(() => {
    let cancelled = false

    void import('./MapClientWrapper').then((module) => {
      if (cancelled) {
        return
      }

      startTransition(() => {
        setMapClientWrapper(() => module.default)
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (!MapClientWrapper) {
    return <MapLoadingPlaceholder />
  }

  return <MapClientWrapper theaters={theaters} />
}
