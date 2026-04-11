import { NextResponse } from 'next/server'

import { jsonError } from '@/lib/api/route'
import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import {
  buildMarketplaceServiceErrorResponse,
  buildMarketplaceUnauthorizedResponse,
  getPositiveIntegerParam,
} from '@/lib/marketplace/http'
import { getMarketplacePostContact } from '@/lib/marketplace/service'

export async function GET(
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

    const result = await getMarketplacePostContact(userId, postId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildMarketplaceUnauthorizedResponse(error)
    }

    return buildMarketplaceServiceErrorResponse(error, {
      fallbackMessage: 'Could not load contact details right now.',
      logLabel: '[api][me][marketplace][posts][contact][GET]',
    })
  }
}
