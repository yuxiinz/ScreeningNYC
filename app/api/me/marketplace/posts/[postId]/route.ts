import { NextResponse } from 'next/server'

import { jsonError } from '@/lib/api/route'
import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import {
  buildMarketplaceServiceErrorResponse,
  buildMarketplaceUnauthorizedResponse,
  getPositiveIntegerParam,
  readJsonBody,
} from '@/lib/marketplace/http'
import {
  cancelMarketplacePost,
  completeMarketplacePost,
} from '@/lib/marketplace/service'
import { MarketplaceValidationError } from '@/lib/marketplace/errors'

function parsePatchBody(body: unknown) {
  const payload = body as {
    status?: unknown
  }

  if (payload.status !== 'COMPLETED') {
    throw new MarketplaceValidationError('status must be COMPLETED.')
  }

  return {
    status: 'COMPLETED' as const,
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const [userId, postId, body] = await Promise.all([
      requireUserId(),
      getPositiveIntegerParam(params, 'postId'),
      readJsonBody(request),
    ])

    if (!postId) {
      return jsonError('INVALID_POST_ID', 'postId must be a positive integer.', 400)
    }

    parsePatchBody(body)
    const result = await completeMarketplacePost(userId, postId)

    return NextResponse.json({
      ok: true,
      post: result.post,
      movieId: result.movieId,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildMarketplaceUnauthorizedResponse(error)
    }

    return buildMarketplaceServiceErrorResponse(error, {
      fallbackMessage: 'Could not update marketplace post right now.',
      logLabel: '[api][me][marketplace][posts][PATCH]',
    })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const [userId, postId] = await Promise.all([
      requireUserId(),
      getPositiveIntegerParam(params, 'postId'),
    ])

    if (!postId) {
      return jsonError('INVALID_POST_ID', 'postId must be a positive integer.', 400)
    }

    const result = await cancelMarketplacePost(userId, postId)

    return NextResponse.json({
      ok: true,
      post: result.post,
      movieId: result.movieId,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildMarketplaceUnauthorizedResponse(error)
    }

    return buildMarketplaceServiceErrorResponse(error, {
      fallbackMessage: 'Could not cancel marketplace post right now.',
      logLabel: '[api][me][marketplace][posts][DELETE]',
    })
  }
}
