import test from 'node:test'
import assert from 'node:assert/strict'

import type { ScrapedShowtime } from '../lib/ingest/adapters/types'
import {
  extractAnthologyProgramFeatureTitle,
  isCuratorialPresentation,
  mergeAnthologyRows,
  shouldForceAnthologyLocalOnly,
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

test('mergeAnthologyRows preserves forceLocalOnly and drops TMDB candidates for local-only rows', () => {
  const veeziRow: ScrapedShowtime = {
    movieTitle: 'JORDAN BELSON RARITIES',
    shownTitle: 'JORDAN BELSON RARITIES',
    startTimeRaw: 'Friday, April 24, 2026 7:00 PM',
    ticketUrl: 'https://ticketing.uswest.veezi.com/purchase/12345',
    sourceUrl: 'https://ticketing.uswest.veezi.com/sessions/example',
    matchedMovieTitleHint: 'JORDAN BELSON RARITIES',
    tmdbTitleCandidates: ['JORDAN BELSON RARITIES'],
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
  assert.equal(merged.tmdbTitleCandidates, undefined)
  assert.equal(merged.forceLocalOnly, true)
})

test('extractAnthologyProgramFeatureTitle pulls concrete feature titles out of PGM headers', () => {
  assert.equal(
    extractAnthologyProgramFeatureTitle(
      'ALLEN GINSBERG PGM 11: ROLLING THUNDER REVUE'
    ),
    'ROLLING THUNDER REVUE'
  )
  assert.equal(
    extractAnthologyProgramFeatureTitle(
      'ROBERT CREELEY, PGM 1: POETRY IN MOTION'
    ),
    'POETRY IN MOTION'
  )
  assert.equal(
    extractAnthologyProgramFeatureTitle('ALLEN GINSBERG PGM 1'),
    undefined
  )
  assert.equal(
    extractAnthologyProgramFeatureTitle(
      'PRISMATIC GROUND: wave 3, program 4: Kohei Ando'
    ),
    undefined
  )
})

test('shouldForceAnthologyLocalOnly keeps unresolved program containers local-only', () => {
  assert.equal(
    shouldForceAnthologyLocalOnly({
      rawTitle: 'ALLEN GINSBERG PGM 1',
      movieTitle: 'ALLEN GINSBERG PGM 1',
    }),
    true
  )
  assert.equal(
    shouldForceAnthologyLocalOnly({
      rawTitle: 'ALLEN GINSBERG PGM 11: ROLLING THUNDER REVUE',
      movieTitle: 'ROLLING THUNDER REVUE',
    }),
    false
  )
  assert.equal(
    shouldForceAnthologyLocalOnly({
      rawTitle: 'PRESENTED BY RAYMOND FOYE: JORDAN BELSON RARITIES',
      movieTitle: 'JORDAN BELSON RARITIES',
    }),
    true
  )
})
