import test from 'node:test'
import assert from 'node:assert/strict'

import type { ScrapedShowtime } from '../lib/ingest/adapters/types'
import {
  mergeFilmForumDuplicateRows,
  resolveFilmForumTitleFields,
} from '../lib/ingest/adapters/filmforum_adapter'

test('resolveFilmForumTitleFields keeps event copy in shownTitle and base film in movieTitle', () => {
  assert.deepEqual(
    resolveFilmForumTitleFields({
      movieTitle:
        'GHOST WORLD Post-film conversation with filmmaker Terry Zwigoff and star Illeana Douglas',
      shownTitle:
        'GHOST WORLD Post-film conversation with filmmaker Terry Zwigoff and star Illeana Douglas',
      relatedMovieTitle: 'GHOST WORLD',
    }),
    {
      movieTitle: 'GHOST WORLD',
      shownTitle:
        'GHOST WORLD Post-film conversation with filmmaker Terry Zwigoff and star Illeana Douglas',
    }
  )
})

test('resolveFilmForumTitleFields strips director cut suffix into shownTitle', () => {
  assert.deepEqual(
    resolveFilmForumTitleFields({
      movieTitle: 'BAD SANTA: THE DIRECTOR’S CUT',
    }),
    {
      movieTitle: 'BAD SANTA',
      shownTitle: 'BAD SANTA: THE DIRECTOR’S CUT',
    }
  )
})

test('mergeFilmForumDuplicateRows prefers event metadata for duplicate showtimes', () => {
  const rows: ScrapedShowtime[] = [
    {
      movieTitle: 'Ghost World',
      startTimeRaw: 'Saturday, April 18, 2026 3:50 PM',
      ticketUrl: 'https://my.filmforum.org/events/ghost-world',
      sourceUrl: 'https://filmforum.org/film/ghost-world-zwigoff',
      posterUrl: 'https://image.tmdb.org/t/p/w500/ghost-world.jpg',
      directorText: 'Terry Zwigoff',
      releaseYear: 2001,
      runtimeMinutes: 111,
    },
    {
      movieTitle: 'Ghost World',
      shownTitle:
        'GHOST WORLD Post-film conversation with filmmaker Terry Zwigoff and star Illeana Douglas',
      startTimeRaw: 'Saturday, April 18, 2026 3:50 PM',
      ticketUrl: 'https://my.filmforum.org/ghost-world/49711',
      sourceUrl: 'https://filmforum.org/events/event/ghost-world-april-18',
      posterUrl: 'https://image.tmdb.org/t/p/w500/ghost-world.jpg',
      directorText: 'Terry Zwigoff',
      releaseYear: 2001,
      runtimeMinutes: 111,
    },
  ]

  assert.deepEqual(mergeFilmForumDuplicateRows(rows), [
    {
      movieTitle: 'Ghost World',
      shownTitle:
        'GHOST WORLD Post-film conversation with filmmaker Terry Zwigoff and star Illeana Douglas',
      startTimeRaw: 'Saturday, April 18, 2026 3:50 PM',
      ticketUrl: 'https://my.filmforum.org/ghost-world/49711',
      sourceUrl: 'https://filmforum.org/events/event/ghost-world-april-18',
      rawFormat: undefined,
      sourceShowtimeId: undefined,
      directorText: 'Terry Zwigoff',
      releaseYear: 2001,
      runtimeMinutes: 111,
      overview: undefined,
      posterUrl: 'https://image.tmdb.org/t/p/w500/ghost-world.jpg',
      tmdbTitleCandidates: undefined,
      preferMovieTitleForDisplay: undefined,
      matchedMovieTitleHint: undefined,
    },
  ])
})

test('mergeFilmForumDuplicateRows normalizes director cut titles before returning rows', () => {
  const rows: ScrapedShowtime[] = [
    {
      movieTitle: 'BAD SANTA: THE DIRECTOR’S CUT',
      startTimeRaw: 'Monday, April 20, 2026 2:30 PM',
      ticketUrl: 'https://my.filmforum.org/events/bad-santa',
      sourceUrl: 'https://filmforum.org/film/bad-santa-zwigoff',
    },
  ]

  assert.deepEqual(mergeFilmForumDuplicateRows(rows), [
    {
      movieTitle: 'BAD SANTA',
      shownTitle: 'BAD SANTA: THE DIRECTOR’S CUT',
      startTimeRaw: 'Monday, April 20, 2026 2:30 PM',
      ticketUrl: 'https://my.filmforum.org/events/bad-santa',
      sourceUrl: 'https://filmforum.org/film/bad-santa-zwigoff',
    },
  ])
})
