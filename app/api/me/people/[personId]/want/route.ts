import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import {
  addDirectorWant,
  removeDirectorWant,
} from '@/lib/user-directors/service'

async function getPersonId(params: Promise<{ personId: string }>) {
  const { personId } = await params
  const parsedPersonId = Number.parseInt(personId, 10)

  if (!Number.isInteger(parsedPersonId) || parsedPersonId <= 0) {
    return null
  }

  return parsedPersonId
}

function buildInvalidPersonIdResponse() {
  return NextResponse.json(
    {
      code: 'INVALID_PERSON_ID',
      message: 'personId must be a positive integer.',
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
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const [userId, personId] = await Promise.all([
      requireUserId(),
      getPersonId(params),
    ])

    if (!personId) {
      return buildInvalidPersonIdResponse()
    }

    const result = await addDirectorWant(userId, personId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error)
    }

    console.error('[api][me][people][want][PUT]', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Could not update director want list right now.',
      },
      { status: 500 }
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
      getPersonId(params),
    ])

    if (!personId) {
      return buildInvalidPersonIdResponse()
    }

    const result = await removeDirectorWant(userId, personId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error)
    }

    console.error('[api][me][people][want][DELETE]', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Could not update director want list right now.',
      },
      { status: 500 }
    )
  }
}
