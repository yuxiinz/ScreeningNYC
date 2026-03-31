import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeScreeningMovieTitle,
  parseScreeningTitle,
} from '../lib/ingest/core/screening_title'
import { searchTmdbMovie } from '../lib/ingest/services/tmdb_service'

test('parseScreeningTitle strips bracketed formats into rawFormat', () => {
  const parsed = parseScreeningTitle('Mulholland Drive [35mm]')

  assert.equal(parsed.title, 'Mulholland Drive')
  assert.equal(parsed.rawFormat, '35mm')
  assert.equal(parsed.preferMovieTitleForDisplay, true)
})

test('parseScreeningTitle handles stacked trailing metadata', () => {
  const parsed = parseScreeningTitle('Mulholland Drive [35mm] (2001)')

  assert.equal(parsed.title, 'Mulholland Drive')
  assert.equal(parsed.rawFormat, '35mm')
  assert.equal(parsed.releaseYear, 2001)
})

test('parseScreeningTitle preserves bracketed notes separately from format', () => {
  const parsed = parseScreeningTitle('The Red Shoes (Q&A) [35mm]')

  assert.equal(parsed.title, 'The Red Shoes')
  assert.equal(parsed.rawFormat, '35mm')
  assert.equal(parsed.showtimeNote, 'Q&A')
})

test('normalizeScreeningMovieTitle returns a clean canonical title', () => {
  assert.equal(normalizeScreeningMovieTitle('2001: A Space Odyssey [70mm]'), '2001: A Space Odyssey')
})

test('searchTmdbMovie fallback normalizes bracketed formats before returning a local title', async () => {
  const result = await searchTmdbMovie({
    title: 'Mulholland Drive [35mm]',
    releaseYear: 2001,
  })

  assert.equal(result.tmdbId, undefined)
  assert.equal(result.title, 'Mulholland Drive')
  assert.equal(result.releaseDate?.getUTCFullYear(), 2001)
})
