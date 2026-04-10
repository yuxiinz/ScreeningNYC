import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseMarketplacePostUpsertBody,
  parseMarketplacePostsBatchBody,
} from '../lib/marketplace/request-body'
import { MarketplaceValidationError } from '../lib/marketplace/errors'

test('parseMarketplacePostUpsertBody normalizes nullable fields for single upserts', () => {
  const parsed = parseMarketplacePostUpsertBody({
    type: 'SELL',
    showtimeId: 88,
    quantity: 2,
    priceCents: 3600,
    seatInfo: 'Row G, Seat 8',
    contactSnapshot: 'sam@example.com',
    displayName: 'Sam',
  })

  assert.deepEqual(parsed, {
    type: 'SELL',
    showtimeId: 88,
    quantity: 2,
    priceCents: 3600,
    seatInfo: 'Row G, Seat 8',
    contactSnapshot: 'sam@example.com',
    displayName: 'Sam',
  })
})

test('parseMarketplacePostsBatchBody dedupes showtime ids and preserves shared fields', () => {
  const parsed = parseMarketplacePostsBatchBody({
    type: 'BUY',
    showtimeIds: [11, 14, 11],
    quantity: 1,
    contactSnapshot: 'dm me on instagram',
  })

  assert.deepEqual(parsed, {
    type: 'BUY',
    showtimeIds: [11, 14],
    quantity: 1,
    priceCents: null,
    seatInfo: null,
    contactSnapshot: 'dm me on instagram',
    displayName: null,
  })
})

test('parseMarketplacePostsBatchBody rejects invalid showtime id lists', () => {
  assert.throws(
    () =>
      parseMarketplacePostsBatchBody({
        type: 'BUY',
        showtimeIds: [11, 0],
        quantity: 1,
        contactSnapshot: 'sam@example.com',
      }),
    (error) =>
      error instanceof MarketplaceValidationError &&
      error.message === 'showtimeIds must contain only positive integers.'
  )
})
