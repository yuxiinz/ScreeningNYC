import { createMarketplaceBodyRoute } from '@/lib/marketplace/http'
import { parseMarketplacePostsBatchBody } from '@/lib/marketplace/request-body'
import { upsertMarketplacePosts } from '@/lib/marketplace/service'

export const POST = createMarketplaceBodyRoute({
  parseBody: parseMarketplacePostsBatchBody,
  run: ({ userId, body }) => upsertMarketplacePosts(userId, body),
  buildSuccessBody: (result) => ({
    posts: result.posts.map((entry) => entry.post),
    count: result.posts.length,
    reusedExistingCount: result.reusedExistingCount,
    notifiedMatchCount: result.notifiedMatchCount,
    movieId: result.movieId,
  }),
  fallbackMessage: 'Could not save marketplace posts right now.',
  logLabel: '[api][me][marketplace][posts][batch][POST]',
})
