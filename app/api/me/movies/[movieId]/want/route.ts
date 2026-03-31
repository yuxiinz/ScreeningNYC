import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import { addWant, removeWant } from '@/lib/user-movies/service'

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

    const result = await addWant(userId, movieId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error)
    }

    console.error('[api][me][movies][want][PUT]', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Could not update want list right now.',
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

    const result = await removeWant(userId, movieId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error)
    }

    console.error('[api][me][movies][want][DELETE]', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Could not update want list right now.',
      },
      { status: 500 }
    )
  }
}
