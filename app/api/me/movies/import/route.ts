import { NextResponse } from 'next/server'

import {
  buildInvalidJsonResponse,
  buildUnauthorizedResponse,
  jsonError,
} from '@/lib/api/route'
import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import { importMoviesForUser } from '@/lib/user-movies/import'

const MAX_CSV_CONTENT_LENGTH = 2_000_000

type MovieImportRequest = {
  listType?: unknown
  csvContent?: unknown
}

export async function POST(request: Request) {
  let body: MovieImportRequest

  try {
    body = (await request.json()) as MovieImportRequest
  } catch {
    return buildInvalidJsonResponse()
  }

  const listType = body.listType
  const csvContent = typeof body.csvContent === 'string' ? body.csvContent : ''

  if (listType !== 'want' && listType !== 'watched') {
    return jsonError(
      'INVALID_LIST_TYPE',
      'listType must be either "want" or "watched".',
      400
    )
  }

  if (!csvContent.trim()) {
    return jsonError('EMPTY_CSV', 'csvContent must not be empty.', 400)
  }

  if (csvContent.length > MAX_CSV_CONTENT_LENGTH) {
    return jsonError('CSV_TOO_LARGE', 'CSV file is too large to import right now.', 413)
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
      return buildUnauthorizedResponse(error.message)
    }

    if (
      error instanceof Error &&
      (error.message.startsWith('Unsupported CSV columns') ||
        error.message.startsWith('Invalid Opening Quote'))
    ) {
      return jsonError('INVALID_CSV', error.message, 400)
    }

    console.error('[api][me][movies][import][POST]', error)
    return jsonError('INTERNAL_ERROR', 'Could not import movies right now.', 500)
  }
}
