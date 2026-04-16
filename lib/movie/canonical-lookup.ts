import type { Movie } from '@prisma/client'

import { normalizeMovieName } from '@/lib/movie/normalize'
import { extractImdbIdFromUrl } from '@/lib/movie/match'

export type CanonicalLookupInput = {
  title: string
  titleCandidates?: string[]
  directorText?: string
  releaseYear?: number
  imdbId?: string
}

function isLikelyBlockedCanonicalPoster(url?: string | null) {
  return Boolean(url && /doubanio\.com\/view\/photo/i.test(url))
}

function hasDistinctTitleAliases(input: CanonicalLookupInput) {
  const normalizedTitles = [input.title, ...(input.titleCandidates || [])]
    .map((candidate) => normalizeMovieName(candidate))
    .filter(Boolean)

  return new Set(normalizedTitles).size > 1
}

export function shouldAttemptCanonicalTmdbLookup(
  localMovie: Pick<Movie, 'tmdbId' | 'imdbUrl' | 'directorText' | 'originalTitle' | 'posterUrl'>,
  input: CanonicalLookupInput
) {
  if (localMovie.tmdbId) {
    return false
  }

  const inputImdbId = extractImdbIdFromUrl(input.imdbId) || input.imdbId?.toLowerCase()
  const localImdbId = extractImdbIdFromUrl(localMovie.imdbUrl)

  if (inputImdbId && localImdbId && inputImdbId === localImdbId) {
    return false
  }

  const hasDisambiguatingMetadata = Boolean(
    input.releaseYear || input.directorText || input.imdbId || hasDistinctTitleAliases(input)
  )

  if (!hasDisambiguatingMetadata) {
    return false
  }

  return Boolean(
    !localMovie.directorText ||
      !localMovie.originalTitle ||
      !localMovie.imdbUrl ||
      isLikelyBlockedCanonicalPoster(localMovie.posterUrl)
  )
}
