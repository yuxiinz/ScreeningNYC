export type MoviePersonKindValue = 'DIRECTOR' | 'CAST'

export type MoviePersonSyncInput = {
  tmdbId?: number
  name: string
  gender?: number | null
  kind: MoviePersonKindValue
  billingOrder?: number
}

export type ExternalPersonMovie = {
  tmdbId: number
  title: string
  year: number | null
  posterUrl: string | null
}
