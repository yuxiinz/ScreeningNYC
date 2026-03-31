import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import { importMoviesForUser } from '@/lib/user-movies/import'

const MAX_CSV_CONTENT_LENGTH = 2_000_000

type MovieImportRequest = {
  listType?: unknown
  csvContent?: unknown
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

export async function POST(request: Request) {
  let body: MovieImportRequest

  try {
    body = (await request.json()) as MovieImportRequest
  } catch {
    return NextResponse.json(
      {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON.',
      },
      { status: 400 }
    )
  }

  const listType = body.listType
  const csvContent = typeof body.csvContent === 'string' ? body.csvContent : ''

  if (listType !== 'want' && listType !== 'watched') {
    return NextResponse.json(
      {
        code: 'INVALID_LIST_TYPE',
        message: 'listType must be either "want" or "watched".',
      },
      { status: 400 }
    )
  }

  if (!csvContent.trim()) {
    return NextResponse.json(
      {
        code: 'EMPTY_CSV',
        message: 'csvContent must not be empty.',
      },
      { status: 400 }
    )
  }

  if (csvContent.length > MAX_CSV_CONTENT_LENGTH) {
    return NextResponse.json(
      {
        code: 'CSV_TOO_LARGE',
        message: 'CSV file is too large to import right now.',
      },
      { status: 413 }
    )
  }

  try {
    const userId = await requireUserId()
    const summary = await importMoviesForUser(userId, {
      listType,
      csvContent,
    })

    return NextResponse.json({
      ok: true,
      ...summary,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error)
    }

    if (
      error instanceof Error &&
      (error.message.startsWith('Unsupported CSV columns') ||
        error.message.startsWith('Invalid Opening Quote'))
    ) {
      return NextResponse.json(
        {
          code: 'INVALID_CSV',
          message: error.message,
        },
        { status: 400 }
      )
    }

    console.error('[api][me][movies][import][POST]', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Could not import movies right now.',
      },
      { status: 500 }
    )
  }
}
