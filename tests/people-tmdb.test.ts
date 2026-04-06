import test from 'node:test'
import assert from 'node:assert/strict'

import { mapTmdbMovieCreditsToPeople } from '../lib/people/tmdb'

test('mapTmdbMovieCreditsToPeople keeps only director crew entries and ignores cast', () => {
  const people = mapTmdbMovieCreditsToPeople({
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

  assert.deepEqual(people, [
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

test('mapTmdbMovieCreditsToPeople respects the director limit and preserves billing order', () => {
  const people = mapTmdbMovieCreditsToPeople(
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
    people.map((person) => ({
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
