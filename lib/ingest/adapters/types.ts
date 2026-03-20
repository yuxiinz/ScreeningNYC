// lib/ingest/adapters/types.ts

export type ScrapedShowtime = {
  movieTitle: string
  startTimeRaw: string
  ticketUrl?: string
  sourceUrl?: string
  rawFormat?: string
  sourceShowtimeId?: string
  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  overview?: string
  posterUrl?: string
}

export type TheaterAdapterConfig = {
  sourceUrl: string
  theaterSlug: string
}

export interface TheaterAdapter {
  scrapeShowtimes(config: TheaterAdapterConfig): Promise<ScrapedShowtime[]>
}