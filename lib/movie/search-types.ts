export type MovieSearchStatus = 'NOW_SHOWING' | 'NONE'

export type MovieSearchResult = {
  id: number
  title: string
  year?: number | null
  status: MovieSearchStatus
}

export type MeMovieSearchLocalResult = MovieSearchResult & {
  inWant: boolean
  inWatched: boolean
}

export type MeMovieSearchExternalResult = {
  source: 'TMDB'
  tmdbId: number
  title: string
  year?: number | null
  posterUrl?: string | null
}
