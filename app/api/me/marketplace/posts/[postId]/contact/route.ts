import { createMarketplacePostIdRoute } from '@/lib/marketplace/http'
import { getMarketplacePostContact } from '@/lib/marketplace/service'

export const GET = createMarketplacePostIdRoute({
  run: ({ userId, postId }) => getMarketplacePostContact(userId, postId),
  buildSuccessBody: (result) => result,
  fallbackMessage: 'Could not load contact details right now.',
  logLabel: '[api][me][marketplace][posts][contact][GET]',
})
