import { createMarketplaceBodyRoute } from '@/lib/marketplace/http'
import { parseMarketplacePostUpsertBody } from '@/lib/marketplace/request-body'
import { upsertMarketplacePost } from '@/lib/marketplace/service'

export const POST = createMarketplaceBodyRoute({
  parseBody: parseMarketplacePostUpsertBody,
  run: ({ userId, body }) => upsertMarketplacePost(userId, body),
  buildSuccessBody: (result) => ({
    post: result.post,
    reusedExisting: result.reusedExisting,
    notifiedMatchCount: result.notifiedMatchCount,
    movieId: result.movieId,
  }),
  fallbackMessage: 'Could not save marketplace post right now.',
  logLabel: '[api][me][marketplace][posts][POST]',
})
