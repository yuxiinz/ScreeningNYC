import { createMarketplacePostIdRoute, readJsonBody } from '@/lib/marketplace/http'
import { cancelMarketplacePost, completeMarketplacePost } from '@/lib/marketplace/service'
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

export const PATCH = createMarketplacePostIdRoute({
  parseBody: async (request) => parsePatchBody(await readJsonBody(request)),
  run: ({ userId, postId }) => completeMarketplacePost(userId, postId),
  buildSuccessBody: (result) => ({
    post: result.post,
    movieId: result.movieId,
  }),
  fallbackMessage: 'Could not update marketplace post right now.',
  logLabel: '[api][me][marketplace][posts][PATCH]',
})

export const DELETE = createMarketplacePostIdRoute({
  run: ({ userId, postId }) => cancelMarketplacePost(userId, postId),
  buildSuccessBody: (result) => ({
    post: result.post,
    movieId: result.movieId,
  }),
  fallbackMessage: 'Could not cancel marketplace post right now.',
  logLabel: '[api][me][marketplace][posts][DELETE]',
})
