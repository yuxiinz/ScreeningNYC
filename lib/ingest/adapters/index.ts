// lib/ingest/adapters/index.ts

import { scrapeMetrographShowtimes } from './metrograph_adapter'
import { scrapeFilmForumShowtimes } from './filmforum_adapter'
import { scrapeIfcCenter } from './ifc_adapter'

export function getShowtimeScraper(theaterSlug: string) {
  switch (theaterSlug) {
    case 'metrograph':
      return scrapeMetrographShowtimes
    case 'filmforum':
      return scrapeFilmForumShowtimes
    case 'ifc':
      return scrapeIfcCenter
    default:
      throw new Error(`Unsupported theater: ${theaterSlug}`)
  }
}