import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDirectorReminderEmail,
  buildMovieReminderEmail,
  countDirectorReminderMovies,
} from '../lib/watchlist-reminders/content'

const firstShowtime = {
  startTime: new Date('2026-04-10T23:30:00.000Z'),
  theater: {
    name: 'Metrograph',
  },
}

test('buildMovieReminderEmail keeps transition copy and detail links stable', () => {
  const email = buildMovieReminderEmail({
    mode: 'transition',
    name: 'Sam',
    items: [
      {
        movie: {
          id: 12,
          title: 'The Matrix',
          showtimes: [firstShowtime],
        },
      },
    ],
  })

  assert.equal(email.subject, 'Screening NYC: The Matrix is now screening')
  assert.match(email.text, /Hi Sam,/)
  assert.match(email.text, /Details: https:\/\/www\.screeningnyc\.com\/films\/12/)
  assert.match(
    email.text,
    /Open want list: https:\/\/www\.screeningnyc\.com\/me\/want-list/
  )
})

test('buildDirectorReminderEmail keeps summary copy and director links stable', () => {
  const items = [
    {
      person: {
        id: 7,
        name: 'Agnes Varda',
      },
      movies: [
        {
          movieId: 101,
          title: 'Cleo from 5 to 7',
          showtimes: [firstShowtime],
        },
        {
          movieId: 102,
          title: 'Vagabond',
          showtimes: [
            {
              startTime: new Date('2026-04-11T01:45:00.000Z'),
              theater: {
                name: 'Film Forum',
              },
            },
          ],
        },
      ],
    },
  ]

  assert.equal(countDirectorReminderMovies(items), 2)

  const email = buildDirectorReminderEmail({
    mode: 'summary',
    items,
  })

  assert.equal(
    email.subject,
    'Screening NYC: 1 director from your want list has films screening'
  )
  assert.match(
    email.text,
    /Director page: https:\/\/www\.screeningnyc\.com\/people\/7/
  )
  assert.match(
    email.text,
    /Open director want list: https:\/\/www\.screeningnyc\.com\/me\/want-list\?tab=directors/
  )
})
