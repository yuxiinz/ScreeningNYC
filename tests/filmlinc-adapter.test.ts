import test from 'node:test'
import assert from 'node:assert/strict'

import { FREE_TICKET_SENTINEL } from '../lib/showtime/ticket'
import {
  isAllowedFlcVenue,
  mapFlcApiFilmToShowtimes,
  resolveFlcTitleFields,
} from '../lib/ingest/adapters/filmlinc_adapter'

test('isAllowedFlcVenue keeps only FLC-operated venues', () => {
  assert.equal(isAllowedFlcVenue('Walter Reade Theater'), true)
  assert.equal(isAllowedFlcVenue('Francesca Beale Theater'), true)
  assert.equal(isAllowedFlcVenue('Amphitheater'), true)
  assert.equal(isAllowedFlcVenue('Alice Tully Hall'), true)
  assert.equal(isAllowedFlcVenue('MoMA Titus 2'), false)
  assert.equal(isAllowedFlcVenue('Howard Gilman Theater'), false)
  assert.equal(isAllowedFlcVenue('Pass Venue'), false)
})

test('resolveFlcTitleFields keeps API event copy in shownTitle and canonical title in movieTitle', () => {
  assert.deepEqual(
    resolveFlcTitleFields({
      apiTitle: 'Miroirs No. 3 Q&A with Christian Petzold',
      canonicalTitle: 'Miroirs No. 3',
    }),
    {
      movieTitle: 'Miroirs No. 3',
      shownTitle: 'Miroirs No. 3 Q&A with Christian Petzold',
      rawFormat: undefined,
      releaseYear: undefined,
      tmdbTitleCandidates: ['Miroirs No. 3 Q&A with Christian Petzold'],
      preferMovieTitleForDisplay: true,
      matchedMovieTitleHint: 'Miroirs No. 3',
    }
  )
})

test('mapFlcApiFilmToShowtimes filters partner venues and maps metadata', () => {
  const rows = mapFlcApiFilmToShowtimes(
    {
      title: 'Miroirs No. 3 Q&A with Christian Petzold',
      slug: 'miroirs-no-3',
      showtimes: [
        {
          id: '1001',
          productionSeasonId: '81017',
          dateTimeET: '2026-04-10T20:00:00-04:00',
          venue: 'Walter Reade Theater',
          ticketsUrl: 'https://purchase.filmlinc.org/81017/1001',
          freeEvent: false,
        },
        {
          id: '1002',
          productionSeasonId: '81017',
          date: '2026-04-11',
          time: '6:30 PM',
          venue: 'Alice Tully Hall',
          ticketsUrl: 'https://purchase.filmlinc.org/81017/1002',
          freeEvent: true,
        },
        {
          id: '1003',
          productionSeasonId: '81017',
          dateTimeET: '2026-04-12T18:00:00-04:00',
          venue: 'MoMA Titus 2',
          ticketsUrl: 'https://purchase.filmlinc.org/81017/1003',
          freeEvent: false,
        },
      ],
    },
    {
      title: 'Miroirs No. 3',
      uri: '/films/miroirs-no-3/',
      excerpt: '<p>Christian Petzold returns with a haunted melodrama.</p>',
      featuredImage: {
        node: {
          sourceUrl:
            'https://wp.filmlinc.org/wp-content/uploads/2025/08/Miroirs-No-3.jpg',
        },
      },
      filmDetails: {
        year: '2025',
        runningTime: '86',
        directors: [{ name: 'Christian Petzold' }],
      },
    }
  )

  assert.deepEqual(rows, [
    {
      movieTitle: 'Miroirs No. 3',
      shownTitle: 'Miroirs No. 3 Q&A with Christian Petzold',
      startTimeRaw: '2026-04-10T20:00:00-04:00',
      ticketUrl: 'https://purchase.filmlinc.org/81017/1001',
      sourceUrl: 'https://www.filmlinc.org/films/miroirs-no-3/',
      rawFormat: undefined,
      sourceShowtimeId: '1001',
      directorText: 'Christian Petzold',
      releaseYear: 2025,
      runtimeMinutes: 86,
      overview: 'Christian Petzold returns with a haunted melodrama.',
      posterUrl:
        'https://wp.filmlinc.org/wp-content/uploads/2025/08/Miroirs-No-3.jpg',
      tmdbTitleCandidates: ['Miroirs No. 3 Q&A with Christian Petzold'],
      preferMovieTitleForDisplay: true,
      matchedMovieTitleHint: 'Miroirs No. 3',
    },
    {
      movieTitle: 'Miroirs No. 3',
      shownTitle: 'Miroirs No. 3 Q&A with Christian Petzold',
      startTimeRaw: '2026-04-11 6:30 PM',
      ticketUrl: FREE_TICKET_SENTINEL,
      sourceUrl: 'https://www.filmlinc.org/films/miroirs-no-3/',
      rawFormat: undefined,
      sourceShowtimeId: '1002',
      directorText: 'Christian Petzold',
      releaseYear: 2025,
      runtimeMinutes: 86,
      overview: 'Christian Petzold returns with a haunted melodrama.',
      posterUrl:
        'https://wp.filmlinc.org/wp-content/uploads/2025/08/Miroirs-No-3.jpg',
      tmdbTitleCandidates: ['Miroirs No. 3 Q&A with Christian Petzold'],
      preferMovieTitleForDisplay: true,
      matchedMovieTitleHint: 'Miroirs No. 3',
    },
  ])
})
