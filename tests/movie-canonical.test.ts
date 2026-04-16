import test from 'node:test'
import assert from 'node:assert/strict'

import {
  directorTextLikelyMatches,
  isLikelyCanonicalDuplicate,
  pickDistinctOriginalTitle,
  scoreCanonicalMovieTarget,
} from '../lib/movie/canonical'

test('directorTextLikelyMatches tolerates common name variants and minor typos', () => {
  assert.equal(
    directorTextLikelyMatches(
      'Phil Lord & Chris Miller',
      'Phil Lord, Christopher Miller'
    ),
    true
  )

  assert.equal(
    directorTextLikelyMatches(
      'Joel Cohen, Ethan Coen',
      'Joel Coen'
    ),
    true
  )
})

test('pickDistinctOriginalTitle prefers distinct non-English aliases over redundant TMDB originals', () => {
  assert.equal(
    pickDistinctOriginalTitle('Panda', [
      'Panda',
      '伤寒杂病论',
      '傷寒雜病論',
    ]),
    '伤寒杂病论'
  )
})

test('isLikelyCanonicalDuplicate allows TMDB/local merges despite placeholder year drift', () => {
  assert.equal(
    isLikelyCanonicalDuplicate(
      {
        id: 2161,
        title: 'Project Hail Mary',
        originalTitle: null,
        directorText: 'Phil Lord, Christopher Miller',
        releaseDate: new Date('2026-02-13T00:00:00.000Z'),
        tmdbId: 687163,
      },
      {
        id: 19783,
        title: 'Project Hail Mary',
        originalTitle: null,
        directorText: 'Phil Lord & Chris Miller',
        releaseDate: new Date('2025-01-01T00:00:00.000Z'),
        tmdbId: null,
      }
    ),
    true
  )
})

test('isLikelyCanonicalDuplicate matches localized rows through originalTitle aliases', () => {
  assert.equal(
    isLikelyCanonicalDuplicate(
      {
        id: 412,
        title: 'Two Mountains Weighing Down My Chest',
        originalTitle: null,
        directorText: 'Haonan Wang',
        releaseDate: new Date('2025-05-15T00:00:00.000Z'),
        tmdbId: 1400123,
      },
      {
        id: 913,
        title: '东山飘雨西山晴',
        originalTitle: 'Two Mountains Weighing Down My Chest',
        directorText: 'Haonan Wang',
        releaseDate: new Date('2025-01-01T00:00:00.000Z'),
        tmdbId: null,
      }
    ),
    true
  )
})

test('isLikelyCanonicalDuplicate refuses to merge different tmdb ids', () => {
  assert.equal(
    isLikelyCanonicalDuplicate(
      {
        id: 7354,
        title: 'Funny Games',
        originalTitle: 'Funny Games',
        directorText: 'Michael Haneke',
        releaseDate: new Date('1997-01-01T00:00:00.000Z'),
        tmdbId: 10234,
      },
      {
        id: 18833,
        title: 'Funny Games',
        originalTitle: 'Funny Games',
        directorText: 'Michael Haneke',
        releaseDate: new Date('2008-01-01T00:00:00.000Z'),
        tmdbId: 8461,
      }
    ),
    false
  )
})

test('scoreCanonicalMovieTarget strongly prefers TMDB-backed rows', () => {
  const tmdbScore = scoreCanonicalMovieTarget({
    title: 'Mother Mary',
    originalTitle: 'Mother Mary',
    posterUrl: 'https://image.tmdb.org/t/p/w500/example.jpg',
    imdbUrl: 'https://www.imdb.com/title/tt1234567',
    tmdbId: 1102883,
    showtimeCount: 34,
  })

  const localScore = scoreCanonicalMovieTarget({
    title: 'MOTHER MARY: Q&A with Filmmaker David Lowery',
    originalTitle: null,
    posterUrl: null,
    imdbUrl: null,
    tmdbId: null,
    showtimeCount: 3,
  })

  assert.ok(tmdbScore > localScore)
})
