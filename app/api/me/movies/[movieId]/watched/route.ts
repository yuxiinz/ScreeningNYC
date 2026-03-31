import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import {
  getReviewWordCount,
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
  const ratingInput = (body as { rating?: unknown })?.rating
  const reviewTextInput = (body as { reviewText?: unknown })?.reviewText

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

  if (
    typeof ratingInput !== 'undefined' &&
    ratingInput !== null &&
    (typeof ratingInput !== 'number' ||
      !Number.isInteger(ratingInput) ||
      ratingInput < 1 ||
      ratingInput > 5)
  ) {
    return NextResponse.json(
      {
        code: 'INVALID_RATING',
        message: 'rating must be null or an integer from 1 to 5.',
      },
      { status: 400 }
    )
  }

  if (
    typeof reviewTextInput !== 'undefined' &&
    reviewTextInput !== null &&
    typeof reviewTextInput !== 'string'
  ) {
    return NextResponse.json(
      {
        code: 'INVALID_REVIEW',
        message: 'reviewText must be a string or null.',
      },
      { status: 400 }
    )
  }

  const rating = typeof ratingInput === 'number' ? ratingInput : null
  const reviewText = typeof reviewTextInput === 'string' ? reviewTextInput : null

  if (getReviewWordCount(reviewText) > 200) {
    return NextResponse.json(
      {
        code: 'REVIEW_TOO_LONG',
        message: 'reviewText must be 200 words or fewer.',
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
      rating,
      reviewText,
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
