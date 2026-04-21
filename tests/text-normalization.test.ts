import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cleanPossessivePrefixTitle,
  cleanText,
} from '../lib/ingest/core/text'

test('cleanPossessivePrefixTitle strips site labels with separators before possessive prefixes', () => {
  assert.equal(
    cleanPossessivePrefixTitle("Film Forum · Mel Brooks' YOUNG FRANKENSTEIN"),
    'YOUNG FRANKENSTEIN'
  )
})

test('cleanText decodes escaped unicode sequences', () => {
  assert.equal(cleanText('Q\\u0026A with John Turturro'), 'Q&A with John Turturro')
})
