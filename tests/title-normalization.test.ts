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

test('parseScreeningTitle strips inline event suffixes into showtimeNote', () => {
  const parsed = parseScreeningTitle('Miroirs No. 3 Q&A with Christian Petzold')

  assert.equal(parsed.title, 'Miroirs No. 3')
  assert.equal(parsed.showtimeNote, 'Q&A with Christian Petzold')
  assert.deepEqual(parsed.tmdbTitleCandidates, [
    'Miroirs No. 3 Q&A with Christian Petzold',
    'Miroirs No. 3',
  ])
})

test('parseScreeningTitle strips event suffixes after separators', () => {
  const parsed = parseScreeningTitle(
    'MOTHER MARY: Q&A with Filmmaker David Lowery'
  )

  assert.equal(parsed.title, 'MOTHER MARY')
  assert.equal(parsed.showtimeNote, 'Q&A with Filmmaker David Lowery')
})

test('parseScreeningTitle decodes escaped event copy before stripping', () => {
  const parsed = parseScreeningTitle('BARTON FINK | Q\\u0026A with John Turturro')

  assert.equal(parsed.title, 'BARTON FINK')
  assert.equal(parsed.showtimeNote, 'Q&A with John Turturro')
})

test('normalizeScreeningMovieTitle strips curatorial presents prefixes', () => {
  assert.equal(
    normalizeScreeningMovieTitle('Roxy Presents: MOTHER MARY'),
    'MOTHER MARY'
  )
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
