import { DateTime } from 'luxon'

import { getReminderBaseUrl } from '@/lib/auth/env'
import { APP_TIMEZONE } from '@/lib/timezone'

type ReminderMode = 'summary' | 'transition'

type ReminderShowtime = {
  startTime: Date
  theater: {
    name: string
  }
}

export type ReminderMovieContentItem = {
  movie: {
    id: number
    title: string
    showtimes: ReminderShowtime[]
  }
}

export type ReminderDirectorContentMovie = {
  movieId: number
  title: string
  showtimes: ReminderShowtime[]
}

export type ReminderDirectorContentItem = {
  person: {
    id: number
    name: string
  }
  movies: ReminderDirectorContentMovie[]
}

type ReminderEmailContent = {
  subject: string
  html: string
  text: string
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural
}

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatShowtimeLabel(value: Date) {
  return DateTime.fromJSDate(value)
    .setZone(APP_TIMEZONE)
    .toFormat("ccc, LLL d 'at' h:mm a")
}

function buildShowtimeSummaryLines(showtimes: ReminderShowtime[]) {
  return showtimes.slice(0, 2).map((showtime, index) => {
    const prefix = index === 0 ? 'Next' : 'Then'
    return `${prefix}: ${formatShowtimeLabel(showtime.startTime)} at ${showtime.theater.name}`
  })
}

function getMovieReminderSortTime(item: ReminderMovieContentItem) {
  return item.movie.showtimes[0]?.startTime.getTime() ?? Number.MAX_SAFE_INTEGER
}

function sortMovieReminderItems(items: ReminderMovieContentItem[]) {
  return [...items].sort((a, b) => {
    const timeDiff = getMovieReminderSortTime(a) - getMovieReminderSortTime(b)

    if (timeDiff !== 0) {
      return timeDiff
    }

    return a.movie.title.localeCompare(b.movie.title)
  })
}

function getDirectorReminderSortTime(item: ReminderDirectorContentItem) {
  return item.movies[0]?.showtimes[0]?.startTime.getTime() ?? Number.MAX_SAFE_INTEGER
}

function sortDirectorReminderItems(items: ReminderDirectorContentItem[]) {
  return [...items].sort((a, b) => {
    const timeDiff = getDirectorReminderSortTime(a) - getDirectorReminderSortTime(b)

    if (timeDiff !== 0) {
      return timeDiff
    }

    return a.person.name.localeCompare(b.person.name)
  })
}

function buildMovieReminderListText(items: ReminderMovieContentItem[]) {
  return sortMovieReminderItems(items)
    .map((item) => {
      const lines = buildShowtimeSummaryLines(item.movie.showtimes)
      const movieUrl = `${getReminderBaseUrl()}/films/${item.movie.id}`

      return [
        `- ${item.movie.title}`,
        ...lines.map((line) => `  ${line}`),
        `  Details: ${movieUrl}`,
      ].join('\n')
    })
    .join('\n\n')
}

function buildMovieReminderListHtml(items: ReminderMovieContentItem[]) {
  return sortMovieReminderItems(items)
    .map((item) => {
      const lines = buildShowtimeSummaryLines(item.movie.showtimes)
      const movieUrl = `${getReminderBaseUrl()}/films/${item.movie.id}`

      return `
        <li style="margin: 0 0 16px;">
          <p style="margin: 0 0 6px; font-size: 16px; font-weight: 700;">
            <a href="${movieUrl}" style="color: #111; text-decoration: none;">
              ${escapeHtml(item.movie.title)}
            </a>
          </p>
          ${lines
            .map(
              (line) =>
                `<p style="margin: 0 0 4px; color: #444;">${escapeHtml(line)}</p>`
            )
            .join('')}
        </li>
      `
    })
    .join('')
}

function buildDirectorReminderListText(items: ReminderDirectorContentItem[]) {
  return sortDirectorReminderItems(items)
    .map((item) => {
      const directorUrl = `${getReminderBaseUrl()}/people/${item.person.id}`

      const movieLines = item.movies
        .slice(0, 3)
        .map((movie) => {
          const movieUrl = `${getReminderBaseUrl()}/films/${movie.movieId}`

          return [
            `  - ${movie.title}`,
            ...buildShowtimeSummaryLines(movie.showtimes).map((line) => `    ${line}`),
            `    Details: ${movieUrl}`,
          ].join('\n')
        })
        .join('\n')

      return [
        `- ${item.person.name}`,
        `  Director page: ${directorUrl}`,
        movieLines,
      ].join('\n')
    })
    .join('\n\n')
}

function buildDirectorReminderListHtml(items: ReminderDirectorContentItem[]) {
  return sortDirectorReminderItems(items)
    .map((item) => {
      const directorUrl = `${getReminderBaseUrl()}/people/${item.person.id}`

      return `
        <li style="margin: 0 0 18px;">
          <p style="margin: 0 0 8px; font-size: 16px; font-weight: 700;">
            <a href="${directorUrl}" style="color: #111; text-decoration: none;">
              ${escapeHtml(item.person.name)}
            </a>
          </p>
          <ul style="margin: 0; padding-left: 20px;">
            ${item.movies
              .slice(0, 3)
              .map((movie) => {
                const movieUrl = `${getReminderBaseUrl()}/films/${movie.movieId}`

                return `
                  <li style="margin: 0 0 10px;">
                    <p style="margin: 0 0 4px; font-weight: 600;">
                      <a href="${movieUrl}" style="color: #111; text-decoration: none;">
                        ${escapeHtml(movie.title)}
                      </a>
                    </p>
                    ${buildShowtimeSummaryLines(movie.showtimes)
                      .map(
                        (line) =>
                          `<p style="margin: 0 0 4px; color: #444;">${escapeHtml(line)}</p>`
                      )
                      .join('')}
                  </li>
                `
              })
              .join('')}
          </ul>
        </li>
      `
    })
    .join('')
}

function buildReminderEmailContent({
  ctaLabel,
  ctaUrl,
  greeting,
  intro,
  listHtml,
  listText,
  subject,
}: {
  ctaLabel: string
  ctaUrl: string
  greeting: string
  intro: string
  listHtml: string
  listText: string
  subject: string
}): ReminderEmailContent {
  return {
    subject,
    html: `
      <div style="font-family: Helvetica Neue, Arial, sans-serif; color: #111;">
        <p>${escapeHtml(greeting)}</p>
        <p>${escapeHtml(intro)}</p>
        <ul style="padding-left: 20px;">
          ${listHtml}
        </ul>
        <p>
          <a href="${ctaUrl}" style="display: inline-block; padding: 12px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">
            ${ctaLabel}
          </a>
        </p>
      </div>
    `,
    text: [
      greeting,
      '',
      intro,
      '',
      listText,
      '',
      `${ctaLabel}: ${ctaUrl}`,
    ].join('\n'),
  }
}

export function buildMovieReminderEmail({
  items,
  mode,
  name,
}: {
  items: ReminderMovieContentItem[]
  mode: ReminderMode
  name?: string | null
}): ReminderEmailContent {
  const count = items.length
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const wantListUrl = `${getReminderBaseUrl()}/me/want-list`

  if (mode === 'transition') {
    return buildReminderEmailContent({
      subject:
        count === 1
          ? `Screening NYC: ${items[0]?.movie.title} is now screening`
          : `Screening NYC: ${count} films from your want list are now screening`,
      greeting,
      intro: `The ${count === 1 ? 'film below was' : 'films below were'} in your want list before ${count === 1 ? 'it was' : 'they were'} on screen. ${count === 1 ? 'It now has' : 'They now have'} upcoming NYC showtimes:`,
      listHtml: buildMovieReminderListHtml(items),
      listText: buildMovieReminderListText(items),
      ctaLabel: 'Open want list',
      ctaUrl: wantListUrl,
    })
  }

  return buildReminderEmailContent({
    subject:
      count === 1
        ? 'Screening NYC: 1 film from your want list is screening'
        : `Screening NYC: ${count} films from your want list are screening`,
    greeting,
    intro: `Here is your Friday summary of the ${pluralize(count, 'film')} from your want list that ${count === 1 ? 'is' : 'are'} currently on screen in NYC:`,
    listHtml: buildMovieReminderListHtml(items),
    listText: buildMovieReminderListText(items),
    ctaLabel: 'Open want list',
    ctaUrl: wantListUrl,
  })
}

export function countDirectorReminderMovies(items: ReminderDirectorContentItem[]) {
  return items.reduce((sum, item) => sum + item.movies.length, 0)
}

export function buildDirectorReminderEmail({
  items,
  mode,
  name,
}: {
  items: ReminderDirectorContentItem[]
  mode: ReminderMode
  name?: string | null
}): ReminderEmailContent {
  const count = items.length
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const wantListUrl = `${getReminderBaseUrl()}/me/want-list?tab=directors`

  if (mode === 'transition') {
    const totalMovies = countDirectorReminderMovies(items)

    return buildReminderEmailContent({
      subject:
        count === 1 && totalMovies === 1
          ? `Screening NYC: a film by ${items[0]?.person.name} is now screening`
          : `Screening NYC: ${count} directors from your want list have films screening`,
      greeting,
      intro: `The ${count === 1 ? 'director below now has' : 'directors below now have'} films screening in NYC:`,
      listHtml: buildDirectorReminderListHtml(items),
      listText: buildDirectorReminderListText(items),
      ctaLabel: 'Open director want list',
      ctaUrl: wantListUrl,
    })
  }

  return buildReminderEmailContent({
    subject:
      count === 1
        ? 'Screening NYC: 1 director from your want list has films screening'
        : `Screening NYC: ${count} directors from your want list have films screening`,
    greeting,
    intro: `Here is your Friday summary of the ${pluralize(count, 'director')} from your want list that ${count === 1 ? 'currently has' : 'currently have'} films on screen in NYC:`,
    listHtml: buildDirectorReminderListHtml(items),
    listText: buildDirectorReminderListText(items),
    ctaLabel: 'Open director want list',
    ctaUrl: wantListUrl,
  })
}
