import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import {
  resolveDirectorFromTmdbId,
  TmdbApiKeyMissingError,
  TmdbPersonNotDirectorError,
  TmdbPersonNotFoundError,
} from '@/lib/people/resolve'

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

  try {
    await requireUserId()

    const person = await resolveDirectorFromTmdbId(tmdbIdInput)

    return NextResponse.json({
      ok: true,
      personId: person.id,
      name: person.name,
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

    if (error instanceof TmdbPersonNotFoundError) {
      return NextResponse.json(
        {
          code: 'TMDB_PERSON_NOT_FOUND',
          message: error.message,
        },
        { status: 404 }
      )
    }

    if (error instanceof TmdbPersonNotDirectorError) {
      return NextResponse.json(
        {
          code: 'TMDB_PERSON_NOT_DIRECTOR',
          message: error.message,
        },
        { status: 422 }
      )
    }

    console.error('[api][me][people][resolve][POST]', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Could not resolve director right now.',
      },
      { status: 500 }
    )
  }
}
