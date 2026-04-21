import test from 'node:test'
import assert from 'node:assert/strict'

import type { ScrapedShowtime } from '../lib/ingest/adapters/types'
import {
  isCuratorialPresentation,
  mergeAnthologyRows,
} from '../lib/ingest/adapters/anthology-adapter'

test('isCuratorialPresentation only flags presented-by curatorial headers', () => {
  assert.equal(
    isCuratorialPresentation('PRESENTED BY RAYMOND FOYE: JORDAN BELSON RARITIES'),
    true
  )
  assert.equal(
    isCuratorialPresentation('CO-PRESENTED BY LIGHT INDUSTRY: RARE SHORTS'),
    true
  )
  assert.equal(
    isCuratorialPresentation('ALLEN GINSBERG PGM 3: GUNS OF THE TREES'),
    false
  )
})

test('mergeAnthologyRows preserves forceLocalOnly when calendar metadata is merged in', () => {
  const veeziRow: ScrapedShowtime = {
    movieTitle: 'JORDAN BELSON RARITIES',
    shownTitle: 'JORDAN BELSON RARITIES',
    startTimeRaw: 'Friday, April 24, 2026 7:00 PM',
    ticketUrl: 'https://ticketing.uswest.veezi.com/purchase/12345',
    sourceUrl: 'https://ticketing.uswest.veezi.com/sessions/example',
    matchedMovieTitleHint: 'JORDAN BELSON RARITIES',
  }

  const calendarRow: ScrapedShowtime = {
    movieTitle: 'PRESENTED BY RAYMOND FOYE: JORDAN BELSON RARITIES',
    shownTitle: 'PRESENTED BY RAYMOND FOYE: JORDAN BELSON RARITIES',
    startTimeRaw: 'Friday, April 24, 2026 7:00 PM',
    sourceUrl: 'https://www.anthologyfilmarchives.org/film_screenings/calendar#showing-12345',
    tmdbTitleCandidates: ['PRESENTED BY RAYMOND FOYE', 'JORDAN BELSON RARITIES'],
    matchedMovieTitleHint: 'JORDAN BELSON RARITIES',
    forceLocalOnly: true,
  }

  const merged = mergeAnthologyRows(veeziRow, calendarRow)

  assert.equal(
    merged.shownTitle,
    'PRESENTED BY RAYMOND FOYE: JORDAN BELSON RARITIES'
  )
  assert.equal(
    merged.sourceUrl,
    'https://www.anthologyfilmarchives.org/film_screenings/calendar#showing-12345'
  )
  assert.ok(merged.tmdbTitleCandidates?.includes('PRESENTED BY RAYMOND FOYE'))
  assert.ok(merged.tmdbTitleCandidates?.includes('JORDAN BELSON RARITIES'))
  assert.ok(
    merged.tmdbTitleCandidates?.includes(
      'PRESENTED BY RAYMOND FOYE: JORDAN BELSON RARITIES'
    )
  )
  assert.equal(merged.forceLocalOnly, true)
})
