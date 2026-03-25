export type MovieSearchStatus = 'NOW_SHOWING' | 'NONE'

export type MovieSearchResult = {
  id: number
  title: string
  year?: number | null
  status: MovieSearchStatus
}
