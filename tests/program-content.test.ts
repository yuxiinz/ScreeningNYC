import test from 'node:test'
import assert from 'node:assert/strict'

import { isProgramContent } from '../lib/ingest/core/program-content'

test('isProgramContent does not flag single features just because synopsis mentions retrospective or festival', () => {
  assert.equal(
    isProgramContent({
      title: "Palestine '36",
      overview:
        'Writer-director Annemarie Jacir (who was last at BAM for a full retrospective in 2018) returns with her most ambitious project to date.',
    }),
    false
  )

  assert.equal(
    isProgramContent({
      title: 'Sirât',
      overview:
        "Sirāt shared the Jury Prize at this year's Cannes Film Festival.",
    }),
    false
  )
})

test('isProgramContent still flags actual programs', () => {
  assert.equal(
    isProgramContent({
      title: 'Award-Winning Shorts',
      overview: 'A showcase of new work.',
    }),
    true
  )

  assert.equal(
    isProgramContent({
      title: 'Some Film',
      overview: 'Presented as part of the spring retrospective.',
    }),
    true
  )
})
