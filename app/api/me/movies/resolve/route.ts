import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import {
  resolveMovieFromTmdbId,
  TmdbApiKeyMissingError,
  TmdbMovieNotFoundError,
} from '@/lib/movie/resolve'

function buildUnauthorizedResponse(error: AuthRequiredError) {
  return NextResponse.json(
    {
      code: 'UNAUTHORIZED',
      message: error.message,
    },
    { status: 401 }
  )
}

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON.',
      },
      { status: 400 }
    )
  }

  const tmdbIdInput = (body as { tmdbId?: unknown })?.tmdbId

  if (
    typeof tmdbIdInput !== 'number' ||
    !Number.isInteger(tmdbIdInput) ||
    tmdbIdInput <= 0
  ) {
    return NextResponse.json(
      {
        code: 'INVALID_TMDB_ID',
        message: 'tmdbId must be a positive integer.',
      },
      { status: 400 }
    )
  }

  const tmdbId = tmdbIdInput

  try {
    await requireUserId()

    const movie = await resolveMovieFromTmdbId(tmdbId)

    return NextResponse.json({
      ok: true,
      movieId: movie.id,
      title: movie.title,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error)
    }

    if (error instanceof TmdbApiKeyMissingError) {
      return NextResponse.json(
        {
          code: 'TMDB_NOT_CONFIGURED',
          message: error.message,
        },
        { status: 503 }
      )
    }

    if (error instanceof TmdbMovieNotFoundError) {
      return NextResponse.json(
        {
          code: 'TMDB_MOVIE_NOT_FOUND',
          message: error.message,
        },
        { status: 404 }
      )
    }

    console.error('[api][me][movies][resolve][POST]', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Could not resolve movie right now.',
      },
      { status: 500 }
    )
  }
}
