// lib/ingest/adapters/index.ts

import { scrapeMetrographShowtimes } from './metrograph_adapter'
import { scrapeFilmForumShowtimes } from './filmforum_adapter'
import { scrapeIfcCenter } from './ifc_adapter'
import { scrapeQuadCinemaShowtimes } from './quad_adapter'
import { scrapeMomaShowtimes } from './moma_adapter'
import { scrapeAnthologyShowtimes } from './anthology_adapter'
import { scrapeAngelikaShowtimes } from './angelika_adapter'

export function getShowtimeScraper(theaterSlug: string) {
  switch (theaterSlug) {
    case 'metrograph':
      return scrapeMetrographShowtimes
    case 'filmforum':
      return scrapeFilmForumShowtimes
    case 'ifc':
      return scrapeIfcCenter
    case 'quad':
      return scrapeQuadCinemaShowtimes
    case 'moma':
      return scrapeMomaShowtimes
    case 'anthology':
      return scrapeAnthologyShowtimes
    case 'angelikaNYC':
    case 'angelikaEV':
    case 'angelika123':
      return scrapeAngelikaShowtimes
    default:
      throw new Error(`Unsupported theater: ${theaterSlug}`)
  }
}
