// lib/ingest/adapters/types.ts

export type ScrapedShowtime = {
  movieTitle: string
  shownTitle?: string
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
  tmdbTitleCandidates?: string[]
  preferMovieTitleForDisplay?: boolean
  matchedMovieTitleHint?: string
}

export type TheaterAdapterConfig = {
  sourceUrl: string
  theaterSlug: string
}

export interface TheaterAdapter {
  scrapeShowtimes(config: TheaterAdapterConfig): Promise<ScrapedShowtime[]>
}
