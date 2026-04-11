export type DirectorSearchResult = {
  id: number
  name: string
  tmdbId: number | null
  filmCount: number
}

export type MeDirectorSearchExternalResult = {
  source: 'TMDB'
  tmdbId: number
  name: string
}
