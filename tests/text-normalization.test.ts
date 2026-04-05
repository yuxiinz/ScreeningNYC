import test from 'node:test'
import assert from 'node:assert/strict'

import { cleanPossessivePrefixTitle } from '../lib/ingest/core/text'

test('cleanPossessivePrefixTitle strips site labels with separators before possessive prefixes', () => {
  assert.equal(
    cleanPossessivePrefixTitle('Film Forum · Mel Brooks’ YOUNG FRANKENSTEIN'),
    'YOUNG FRANKENSTEIN'
  )
})
