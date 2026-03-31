import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import {
  markWatched,
  removeWatched,
  WantRemovalConfirmationRequiredError,
} from '@/lib/user-movies/service'

async function getMovieId(params: Promise<{ movieId: string }>) {
  const { movieId } = await params
  const parsedMovieId = Number.parseInt(movieId, 10)

  if (!Number.isInteger(parsedMovieId) || parsedMovieId <= 0) {
    return null
  }

  return parsedMovieId
}

function buildInvalidMovieIdResponse() {
  return NextResponse.json(
    {
      code: 'INVALID_MOVIE_ID',
      message: 'movieId must be a positive integer.',
    },
    { status: 400 }
  )
}

function buildUnauthorizedResponse(error: AuthRequiredError) {
  return NextResponse.json(
    {
      code: 'UNAUTHORIZED',
      message: error.message,
    },
    { status: 401 }
  )
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ movieId: string }> }
) {
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

  const confirmRemoveWant = (body as { confirmRemoveWant?: unknown })
    ?.confirmRemoveWant

  if (
    typeof confirmRemoveWant !== 'undefined' &&
    typeof confirmRemoveWant !== 'boolean'
  ) {
    return NextResponse.json(
      {
        code: 'INVALID_CONFIRMATION',
        message: 'confirmRemoveWant must be a boolean.',
      },
      { status: 400 }
    )
  }

  try {
    const [userId, movieId] = await Promise.all([
      requireUserId(),
      getMovieId(params),
    ])

    if (!movieId) {
      return buildInvalidMovieIdResponse()
    }

    const result = await markWatched(userId, movieId, {
      confirmRemoveWant,
    })

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error)
    }

    if (error instanceof WantRemovalConfirmationRequiredError) {
      return NextResponse.json(
        {
          code: 'WANT_REMOVAL_CONFIRMATION_REQUIRED',
          message: error.message,
        },
        { status: 409 }
      )
    }

    console.error('[api][me][movies][watched][PUT]', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Could not update watched list right now.',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ movieId: string }> }
) {
  try {
    const [userId, movieId] = await Promise.all([
      requireUserId(),
      getMovieId(params),
    ])

    if (!movieId) {
      return buildInvalidMovieIdResponse()
    }

    const result = await removeWatched(userId, movieId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error)
    }

    console.error('[api][me][movies][watched][DELETE]', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Could not update watched list right now.',
      },
      { status: 500 }
    )
  }
}
