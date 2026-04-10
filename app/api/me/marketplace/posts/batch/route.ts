import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import {
  buildMarketplaceServiceErrorResponse,
  buildMarketplaceUnauthorizedResponse,
  readJsonBody,
} from '@/lib/marketplace/http'
import { parseMarketplacePostsBatchBody } from '@/lib/marketplace/request-body'
import { upsertMarketplacePosts } from '@/lib/marketplace/service'

export async function POST(request: Request) {
  try {
    const [userId, body] = await Promise.all([requireUserId(), readJsonBody(request)])
    const result = await upsertMarketplacePosts(
      userId,
      parseMarketplacePostsBatchBody(body)
    )

    return NextResponse.json({
      ok: true,
      posts: result.posts.map((entry) => entry.post),
      count: result.posts.length,
      reusedExistingCount: result.reusedExistingCount,
      notifiedMatchCount: result.notifiedMatchCount,
      movieId: result.movieId,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildMarketplaceUnauthorizedResponse(error)
    }

    return buildMarketplaceServiceErrorResponse(error, {
      fallbackMessage: 'Could not save marketplace posts right now.',
      logLabel: '[api][me][marketplace][posts][batch][POST]',
    })
  }
}
