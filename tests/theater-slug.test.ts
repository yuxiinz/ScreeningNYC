import test from 'node:test'
import assert from 'node:assert/strict'

import { parseTheaterSlugs } from '../lib/routing/search-params'
import {
  dedupeTheatersByNormalizedSlug,
  normalizeTheaterSlug,
} from '../lib/theater/slug'

test('normalizeTheaterSlug lowercases and trims theater slugs', () => {
  assert.equal(normalizeTheaterSlug('  angelikaNYC  '), 'angelikanyc')
})

test('parseTheaterSlugs canonicalizes comma-separated theater slugs', () => {
  assert.deepEqual(
    parseTheaterSlugs('angelikaNYC, angelikaEV,angelikanyc'),
    ['angelikanyc', 'angelikaev', 'angelikanyc']
  )
})

test('dedupeTheatersByNormalizedSlug keeps the canonical lowercase theater row', () => {
  const deduped = dedupeTheatersByNormalizedSlug([
    {
      id: 19,
      slug: 'angelikaNYC',
      updatedAt: new Date('2026-04-16T15:09:25.060Z'),
    },
    {
      id: 609,
      slug: 'angelikanyc',
      updatedAt: new Date('2026-05-08T15:33:19.114Z'),
    },
  ])

  assert.deepEqual(deduped, [
    {
      id: 609,
      slug: 'angelikanyc',
      updatedAt: new Date('2026-05-08T15:33:19.114Z'),
    },
  ])
})
