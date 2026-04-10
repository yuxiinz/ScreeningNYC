// Prisma keeps CAST in the database enum, but the current app only syncs,
// queries, and watches directors. Expand this only when non-director person
// flows are intentionally supported end to end.
export type MovieDirectorSyncInput = {
  tmdbId?: number
  name: string
  gender?: number | null
  photoUrl?: string | null
  kind: 'DIRECTOR'
  billingOrder?: number
}

export type ExternalDirectorMovie = {
  tmdbId: number
  title: string
  year: number | null
  posterUrl: string | null
}
