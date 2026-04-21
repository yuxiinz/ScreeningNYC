import { notFound, redirect } from 'next/navigation'

import {
  resolveMovieFromTmdbId,
  TmdbMovieNotFoundError,
} from '@/lib/movie/resolve'
import { TmdbApiKeyMissingError } from '@/lib/tmdb/client'

export default async function TmdbFilmRedirectPage({
  params,
}: {
  params: Promise<{ tmdbId: string }>
}) {
  const { tmdbId } = await params
  const parsedTmdbId = Number.parseInt(tmdbId, 10)

  if (!Number.isInteger(parsedTmdbId) || parsedTmdbId <= 0) {
    notFound()
  }

  try {
    const movie = await resolveMovieFromTmdbId(parsedTmdbId)
    redirect(`/films/${movie.id}`)
  } catch (error) {
    if (
      error instanceof TmdbApiKeyMissingError ||
      error instanceof TmdbMovieNotFoundError
    ) {
      notFound()
    }

    throw error
  }
}
