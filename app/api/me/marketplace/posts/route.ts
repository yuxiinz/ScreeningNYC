import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import {
  buildMarketplaceServiceErrorResponse,
  buildMarketplaceUnauthorizedResponse,
  readJsonBody,
} from '@/lib/marketplace/http'
import { parseMarketplacePostUpsertBody } from '@/lib/marketplace/request-body'
import { upsertMarketplacePost } from '@/lib/marketplace/service'

export async function POST(request: Request) {
  try {
    const [userId, body] = await Promise.all([requireUserId(), readJsonBody(request)])
    const result = await upsertMarketplacePost(
      userId,
      parseMarketplacePostUpsertBody(body)
    )

    return NextResponse.json({
      ok: true,
      post: result.post,
      reusedExisting: result.reusedExisting,
      notifiedMatchCount: result.notifiedMatchCount,
      movieId: result.movieId,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildMarketplaceUnauthorizedResponse(error)
    }

    return buildMarketplaceServiceErrorResponse(error, {
      fallbackMessage: 'Could not save marketplace post right now.',
      logLabel: '[api][me][marketplace][posts][POST]',
    })
  }
}
