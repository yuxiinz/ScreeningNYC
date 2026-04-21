import { MarketplaceValidationError } from '@/lib/marketplace/errors'
import { normalizeMarketplacePostType } from '@/lib/marketplace/shared'

type ParsedMarketplacePostCommonBody = {
  type: 'BUY' | 'SELL'
  quantity: number
  priceCents?: number | null
  seatInfo?: string | null
  contactSnapshot: string
  displayName?: string | null
}

export type ParsedMarketplacePostUpsertBody = ParsedMarketplacePostCommonBody & {
  showtimeId: number
}

export type ParsedMarketplacePostsBatchBody = ParsedMarketplacePostCommonBody & {
  showtimeIds: number[]
}

type UpsertBodyPayload = {
  type?: unknown
  showtimeId?: unknown
  showtimeIds?: unknown
  quantity?: unknown
  priceCents?: unknown
  seatInfo?: unknown
  contactSnapshot?: unknown
  displayName?: unknown
}

function parseUpsertCommonFields(
  payload: UpsertBodyPayload
): ParsedMarketplacePostCommonBody {
  const type = normalizeMarketplacePostType(
    typeof payload.type === 'string' ? payload.type : null
  )

  if (!type) {
    throw new MarketplaceValidationError('type must be BUY or SELL.')
  }

  return {
    type,
    quantity:
      typeof payload.quantity === 'number' ? payload.quantity : Number.NaN,
    priceCents:
      typeof payload.priceCents === 'number'
        ? payload.priceCents
        : payload.priceCents === null || typeof payload.priceCents === 'undefined'
          ? null
          : Number.NaN,
    seatInfo: typeof payload.seatInfo === 'string' ? payload.seatInfo : null,
    contactSnapshot:
      typeof payload.contactSnapshot === 'string' ? payload.contactSnapshot : '',
    displayName:
      typeof payload.displayName === 'string' ? payload.displayName : null,
  }
}

function parsePositiveIntegerList(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new MarketplaceValidationError(
      `${fieldName} must contain at least one positive integer.`
    )
  }

  const seen = new Set<number>()
  const parsedValues: number[] = []

  for (const entry of value) {
    if (!Number.isInteger(entry) || entry <= 0) {
      throw new MarketplaceValidationError(
        `${fieldName} must contain only positive integers.`
      )
    }

    if (!seen.has(entry)) {
      seen.add(entry)
      parsedValues.push(entry)
    }
  }

  if (parsedValues.length === 0) {
    throw new MarketplaceValidationError(
      `${fieldName} must contain at least one positive integer.`
    )
  }

  return parsedValues
}

function parseMarketplacePostBody<TShowtimeFields>(
  body: unknown,
  parseShowtimeFields: (payload: UpsertBodyPayload) => TShowtimeFields
): ParsedMarketplacePostCommonBody & TShowtimeFields {
  const payload = body as UpsertBodyPayload

  return {
    ...parseUpsertCommonFields(payload),
    ...parseShowtimeFields(payload),
  }
}

export function parseMarketplacePostUpsertBody(
  body: unknown
): ParsedMarketplacePostUpsertBody {
  return parseMarketplacePostBody(body, (payload) => ({
    showtimeId:
      typeof payload.showtimeId === 'number' ? payload.showtimeId : Number.NaN,
  }))
}

export function parseMarketplacePostsBatchBody(
  body: unknown
): ParsedMarketplacePostsBatchBody {
  return parseMarketplacePostBody(body, (payload) => ({
    showtimeIds: parsePositiveIntegerList(payload.showtimeIds, 'showtimeIds'),
  }))
}
