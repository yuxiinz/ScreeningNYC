export const MARKETPLACE_POST_TYPES = ['BUY', 'SELL'] as const
export const MARKETPLACE_POST_STATUSES = [
  'ACTIVE',
  'COMPLETED',
  'CANCELED',
] as const

export type MarketplacePostTypeValue = (typeof MARKETPLACE_POST_TYPES)[number]
export type MarketplacePostStatusValue =
  (typeof MARKETPLACE_POST_STATUSES)[number]

function normalizeSingleLineText(value?: string | null) {
  return (value || '').replace(/\s+/g, ' ').trim()
}

export function normalizeMarketplacePostType(
  value?: string | null
): MarketplacePostTypeValue | null {
  const normalized = normalizeSingleLineText(value).toUpperCase()

  return MARKETPLACE_POST_TYPES.includes(
    normalized as MarketplacePostTypeValue
  )
    ? (normalized as MarketplacePostTypeValue)
    : null
}

export function getOppositeMarketplacePostType(
  value: MarketplacePostTypeValue
): MarketplacePostTypeValue {
  return value === 'BUY' ? 'SELL' : 'BUY'
}

export function normalizeMarketplaceDisplayName(value?: string | null) {
  return normalizeSingleLineText(value)
}

export function normalizeMarketplaceContactSnapshot(value?: string | null) {
  return normalizeSingleLineText(value)
}

export function normalizeMarketplaceSeatInfo(value?: string | null) {
  const normalized = normalizeSingleLineText(value)
  return normalized || null
}
