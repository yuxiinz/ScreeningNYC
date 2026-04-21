// lib/ingest/adapters/index.ts

import { scrapeMetrographShowtimes } from './metrograph-adapter'
import { scrapeFilmForumShowtimes } from './filmforum-adapter'
import { scrapeIfcCenterShowtimes } from './ifc-adapter'
import { scrapeQuadCinemaShowtimes } from './quad-adapter'
import { scrapeCinemaVillageShowtimes } from './cinemavillage-adapter'
import { scrapeSpectacleShowtimes } from './spectacle-adapter'
import { scrapeRoxyShowtimes } from './roxy-adapter'
import { scrapeMomaShowtimes } from './moma-adapter'
import { scrapeAnthologyShowtimes } from './anthology-adapter'
import { scrapeAngelikaShowtimes } from './angelika-adapter'
import { scrapeMomiShowtimes } from './momi-adapter'
import { scrapeBamShowtimes } from './bam-adapter'
import { scrapeParisShowtimes } from './paris-adapter'
import { scrapeNitehawkShowtimes } from './nitehawk-adapter'
import { scrapeJapanSocietyShowtimes } from './japansociety-adapter'
import { scrapeFlcShowtimes } from './filmlinc-adapter'

export function getShowtimeScraper(theaterSlug: string) {
  switch (theaterSlug) {
    case 'metrograph':
      return scrapeMetrographShowtimes
    case 'filmforum':
      return scrapeFilmForumShowtimes
    case 'ifc':
      return scrapeIfcCenterShowtimes
    case 'quad':
      return scrapeQuadCinemaShowtimes
    case 'cinemavillage':
      return scrapeCinemaVillageShowtimes
    case 'spectacle':
      return scrapeSpectacleShowtimes
    case 'roxy':
      return scrapeRoxyShowtimes
    case 'moma':
      return scrapeMomaShowtimes
    case 'momi':
      return scrapeMomiShowtimes
    case 'anthology':
      return scrapeAnthologyShowtimes
    case 'bam':
      return scrapeBamShowtimes
    case 'angelikanyc':
    case 'angelikaev':
    case 'angelika123':
      return scrapeAngelikaShowtimes
    case 'paris':
      return scrapeParisShowtimes
    case 'nitehawkwilliamsburg':
    case 'nitehawkprospectpark':
      return scrapeNitehawkShowtimes
    case 'japansociety':
      return scrapeJapanSocietyShowtimes
    case 'flc':
      return scrapeFlcShowtimes
    default:
      throw new Error(`Unsupported theater: ${theaterSlug}`)
  }
}
