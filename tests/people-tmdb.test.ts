import test from 'node:test'
import assert from 'node:assert/strict'

import { mapTmdbMovieCreditsToDirectors } from '../lib/people/tmdb'

test('mapTmdbMovieCreditsToDirectors keeps only director crew entries and ignores cast', () => {
  const directors = mapTmdbMovieCreditsToDirectors({
    crew: [
      {
        id: 101,
        name: 'Jane Director',
        gender: 1,
        profile_path: '/jane.jpg',
        job: 'Director',
      },
      {
        id: 202,
        name: 'Pat Writer',
        profile_path: '/pat.jpg',
        job: 'Writer',
      },
    ],
    cast: [
      {
        id: 303,
        name: 'Chris Actor',
        profile_path: '/chris.jpg',
        order: 0,
      },
    ],
  })

  assert.deepEqual(directors, [
    {
      tmdbId: 101,
      name: 'Jane Director',
      gender: 1,
      photoUrl: 'https://image.tmdb.org/t/p/w500/jane.jpg',
      kind: 'DIRECTOR',
      billingOrder: 0,
    },
  ])
})

test('mapTmdbMovieCreditsToDirectors respects the director limit and preserves billing order', () => {
  const directors = mapTmdbMovieCreditsToDirectors(
    {
      crew: [
        { id: 1, name: 'Director One', job: 'Director' },
        { id: 2, name: 'Director Two', job: 'Director' },
        { id: 3, name: 'Director Three', job: 'Director' },
      ],
    },
    { directorLimit: 2 }
  )

  assert.deepEqual(
    directors.map((person) => ({
      tmdbId: person.tmdbId,
      name: person.name,
      kind: person.kind,
      billingOrder: person.billingOrder,
    })),
    [
      {
        tmdbId: 1,
        name: 'Director One',
        kind: 'DIRECTOR',
        billingOrder: 0,
      },
      {
        tmdbId: 2,
        name: 'Director Two',
        kind: 'DIRECTOR',
        billingOrder: 1,
      },
    ]
  )
})
