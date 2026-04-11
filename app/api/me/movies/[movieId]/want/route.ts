import { NextResponse } from 'next/server'

import {
  buildUnauthorizedResponse,
  getPositiveIntegerParam,
  jsonError,
} from '@/lib/api/route'
import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import { addWant, removeWant } from '@/lib/user-movies/service'

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ movieId: string }> }
) {
  try {
    const [userId, movieId] = await Promise.all([
      requireUserId(),
      getPositiveIntegerParam(params, 'movieId'),
    ])

    if (!movieId) {
      return jsonError('INVALID_MOVIE_ID', 'movieId must be a positive integer.', 400)
    }

    const result = await addWant(userId, movieId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error.message)
    }

    console.error('[api][me][movies][want][PUT]', error)
    return jsonError('INTERNAL_ERROR', 'Could not update want list right now.', 500)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ movieId: string }> }
) {
  try {
    const [userId, movieId] = await Promise.all([
      requireUserId(),
      getPositiveIntegerParam(params, 'movieId'),
    ])

    if (!movieId) {
      return jsonError('INVALID_MOVIE_ID', 'movieId must be a positive integer.', 400)
    }

    const result = await removeWant(userId, movieId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error.message)
    }

    console.error('[api][me][movies][want][DELETE]', error)
    return jsonError('INTERNAL_ERROR', 'Could not update want list right now.', 500)
  }
}
