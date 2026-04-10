import {
  MarketplaceValidationError,
} from '@/lib/marketplace/errors'
import { normalizeMarketplacePostType } from '@/lib/marketplace/shared'

export type ParsedMarketplacePostUpsertBody = {
  type: 'BUY' | 'SELL'
  showtimeId: number
  quantity: number
  priceCents?: number | null
  seatInfo?: string | null
  contactSnapshot: string
  displayName?: string | null
}

export type ParsedMarketplacePostsBatchBody = {
  type: 'BUY' | 'SELL'
  showtimeIds: number[]
  quantity: number
  priceCents?: number | null
  seatInfo?: string | null
  contactSnapshot: string
  displayName?: string | null
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
): Omit<ParsedMarketplacePostsBatchBody, 'showtimeIds'> {
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

  const parsedValues: number[] = []

  for (const entry of value) {
    if (!Number.isInteger(entry) || entry <= 0) {
      throw new MarketplaceValidationError(
        `${fieldName} must contain only positive integers.`
      )
    }

    if (!parsedValues.includes(entry)) {
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

export function parseMarketplacePostUpsertBody(
  body: unknown
): ParsedMarketplacePostUpsertBody {
  const payload = body as UpsertBodyPayload

  return {
    ...parseUpsertCommonFields(payload),
    showtimeId:
      typeof payload.showtimeId === 'number' ? payload.showtimeId : Number.NaN,
  }
}

export function parseMarketplacePostsBatchBody(
  body: unknown
): ParsedMarketplacePostsBatchBody {
  const payload = body as UpsertBodyPayload

  return {
    ...parseUpsertCommonFields(payload),
    showtimeIds: parsePositiveIntegerList(payload.showtimeIds, 'showtimeIds'),
  }
}
