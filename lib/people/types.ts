// Prisma keeps CAST in the database enum, but the current app only syncs,
// queries, and watches directors. Expand this only when non-director person
// flows are intentionally supported end to end.
export const SUPPORTED_MOVIE_PERSON_KIND = 'DIRECTOR' as const

export type MoviePersonKindValue = typeof SUPPORTED_MOVIE_PERSON_KIND

export type MoviePersonSyncInput = {
  tmdbId?: number
  name: string
  gender?: number | null
  photoUrl?: string | null
  kind: MoviePersonKindValue
  billingOrder?: number
}

export type ExternalPersonMovie = {
  tmdbId: number
  title: string
  year: number | null
  posterUrl: string | null
}
