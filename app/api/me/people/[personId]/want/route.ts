import { NextResponse } from 'next/server'

import {
  buildUnauthorizedResponse,
  getPositiveIntegerParam,
  jsonError,
} from '@/lib/api/route'
import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import {
  addDirectorWant,
  removeDirectorWant,
} from '@/lib/user-directors/service'

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const [userId, personId] = await Promise.all([
      requireUserId(),
      getPositiveIntegerParam(params, 'personId'),
    ])

    if (!personId) {
      return jsonError('INVALID_PERSON_ID', 'personId must be a positive integer.', 400)
    }

    const result = await addDirectorWant(userId, personId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error.message)
    }

    console.error('[api][me][people][want][PUT]', error)
    return jsonError(
      'INTERNAL_ERROR',
      'Could not update director want list right now.',
      500
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const [userId, personId] = await Promise.all([
      requireUserId(),
      getPositiveIntegerParam(params, 'personId'),
    ])

    if (!personId) {
      return jsonError('INVALID_PERSON_ID', 'personId must be a positive integer.', 400)
    }

    const result = await removeDirectorWant(userId, personId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error.message)
    }

    console.error('[api][me][people][want][DELETE]', error)
    return jsonError(
      'INTERNAL_ERROR',
      'Could not update director want list right now.',
      500
    )
  }
}
