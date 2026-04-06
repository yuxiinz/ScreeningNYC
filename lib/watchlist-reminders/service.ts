import { DateTime } from 'luxon'

import { sendEmail } from '@/lib/auth/email'
import { getReminderBaseUrl, isMagicLinkConfigured } from '@/lib/auth/env'
import { prisma } from '@/lib/prisma'
import { getUpcomingShowtimeWhere } from '@/lib/showtime/queries'
import { APP_TIMEZONE, getDateKeyInAppTimezone } from '@/lib/timezone'

type ReminderRunOptions = {
  dryRun?: boolean
  force?: boolean
  now?: Date
  mode?: 'auto' | 'summary' | 'transition'
}

type ReminderMovie = {
  watchlistItemId: number
  movie: {
    id: number
    title: string
    showtimes: Array<{
      id: number
      startTime: Date
      theater: {
        name: string
      }
    }>
  }
}

type ReminderUserGroup = {
  userId: string
  email: string
  name: string | null
  items: ReminderMovie[]
}

type ReminderDirectorMovie = {
  movieId: number
  title: string
  showtimes: Array<{
    id: number
    startTime: Date
    theater: {
      name: string
    }
  }>
}

type ReminderDirectorItem = {
  directorWatchlistItemId: number
  person: {
    id: number
    name: string
  }
  movies: ReminderDirectorMovie[]
}

type ReminderDirectorUserGroup = {
  userId: string
  email: string
  name: string | null
  items: ReminderDirectorItem[]
}

export type WatchlistReminderRunResult = {
  dryRun: boolean
  executedMode: 'summary' | 'transition' | 'skipped'
  initializedWatchlistItems: number
  transitionCandidates: number
  transitionEmailsSent: number
  transitionItemsDelivered: number
  directorTransitionCandidates: number
  directorTransitionEmailsSent: number
  directorTransitionItemsDelivered: number
  summaryCandidates: number
  summaryEmailsSent: number
  directorSummaryCandidates: number
  directorSummaryEmailsSent: number
  skippedReason?: string
}

function getExecutionMode(options: ReminderRunOptions, now: Date) {
  if (options.mode === 'summary' || options.mode === 'transition') {
    return options.mode
  }

  return isFridayNoonWindow(now) || (options.force && getLocalNow(now).weekday === 5)
    ? 'summary'
    : 'transition'
}

function getEmailEnabledUserFilter() {
  return {
    email: {
      not: '',
    },
    OR: [
      {
        settings: {
          is: null,
        },
      },
      {
        settings: {
          is: {
            watchlistEmailEnabled: true,
          },
        },
      },
    ],
  }
}

function getLocalNow(now: Date) {
  return DateTime.fromJSDate(now).setZone(APP_TIMEZONE)
}

function getSummaryDateKey(now: Date) {
  return getDateKeyInAppTimezone(now)
}

function isFridayNoonWindow(now: Date) {
  const localNow = getLocalNow(now)
  return localNow.weekday === 5 && localNow.hour === 12
}

function isNoonWindow(now: Date) {
  return getLocalNow(now).hour === 12
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

function sortReminderItems(items: ReminderMovie[]) {
  return [...items].sort((a, b) => {
    const timeA = a.movie.showtimes[0]?.startTime.getTime() ?? Number.MAX_SAFE_INTEGER
    const timeB = b.movie.showtimes[0]?.startTime.getTime() ?? Number.MAX_SAFE_INTEGER

    if (timeA !== timeB) {
      return timeA - timeB
    }

    return a.movie.title.localeCompare(b.movie.title)
  })
}

function getDirectorReminderSortTime(item: ReminderDirectorItem) {
  return item.movies[0]?.showtimes[0]?.startTime.getTime() ?? Number.MAX_SAFE_INTEGER
}

function sortDirectorReminderItems(items: ReminderDirectorItem[]) {
  return [...items].sort((a, b) => {
    const timeDiff = getDirectorReminderSortTime(a) - getDirectorReminderSortTime(b)

    if (timeDiff !== 0) {
      return timeDiff
    }

    return a.person.name.localeCompare(b.person.name)
  })
}

function formatShowtimeLabel(value: Date) {
  return DateTime.fromJSDate(value)
    .setZone(APP_TIMEZONE)
    .toFormat("ccc, LLL d 'at' h:mm a")
}

function buildShowtimeSummaryLines(item: ReminderMovie) {
  return item.movie.showtimes
    .slice(0, 2)
    .map((showtime, index) => {
      const prefix = index === 0 ? 'Next' : 'Then'
      return `${prefix}: ${formatShowtimeLabel(showtime.startTime)} at ${showtime.theater.name}`
    })
}

function buildDirectorMovieSummaryLines(movie: ReminderDirectorMovie) {
  return movie.showtimes
    .slice(0, 2)
    .map((showtime, index) => {
      const prefix = index === 0 ? 'Next' : 'Then'
      return `${prefix}: ${formatShowtimeLabel(showtime.startTime)} at ${showtime.theater.name}`
    })
}

function buildReminderListText(items: ReminderMovie[]) {
  return sortReminderItems(items)
    .map((item) => {
      const lines = buildShowtimeSummaryLines(item)
      const movieUrl = `${getReminderBaseUrl()}/films/${item.movie.id}`

      return [
        `- ${item.movie.title}`,
        ...lines.map((line) => `  ${line}`),
        `  Details: ${movieUrl}`,
      ].join('\n')
    })
    .join('\n\n')
}

function buildReminderListHtml(items: ReminderMovie[]) {
  return sortReminderItems(items)
    .map((item) => {
      const lines = buildShowtimeSummaryLines(item)
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

function buildDirectorReminderListText(items: ReminderDirectorItem[]) {
  return sortDirectorReminderItems(items)
    .map((item) => {
      const directorUrl = `${getReminderBaseUrl()}/people/${item.person.id}`

      const movieLines = item.movies
        .slice(0, 3)
        .map((movie) => {
          const movieUrl = `${getReminderBaseUrl()}/films/${movie.movieId}`

          return [
            `  - ${movie.title}`,
            ...buildDirectorMovieSummaryLines(movie).map((line) => `    ${line}`),
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

function buildDirectorReminderListHtml(items: ReminderDirectorItem[]) {
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
                    ${buildDirectorMovieSummaryLines(movie)
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

function buildTransitionEmail(params: {
  items: ReminderMovie[]
  name?: string | null
}) {
  const count = params.items.length
  const greeting = params.name ? `Hi ${params.name},` : 'Hi,'
  const wantListUrl = `${getReminderBaseUrl()}/me/want-list`
  const subject =
    count === 1
      ? `Screening NYC: ${params.items[0]?.movie.title} is now screening`
      : `Screening NYC: ${count} films from your want list are now screening`

  return {
    subject,
    html: `
      <div style="font-family: Helvetica Neue, Arial, sans-serif; color: #111;">
        <p>${escapeHtml(greeting)}</p>
        <p>The ${count === 1 ? 'film below was' : 'films below were'} in your want list before ${count === 1 ? 'it was' : 'they were'} on screen. ${count === 1 ? 'It now has' : 'They now have'} upcoming NYC showtimes:</p>
        <ul style="padding-left: 20px;">
          ${buildReminderListHtml(params.items)}
        </ul>
        <p>
          <a href="${wantListUrl}" style="display: inline-block; padding: 12px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">
            Open want list
          </a>
        </p>
      </div>
    `,
    text: [
      greeting,
      '',
      `The ${count === 1 ? 'film below was' : 'films below were'} in your want list before ${count === 1 ? 'it was' : 'they were'} on screen. ${count === 1 ? 'It now has' : 'They now have'} upcoming NYC showtimes:`,
      '',
      buildReminderListText(params.items),
      '',
      `Open want list: ${wantListUrl}`,
    ].join('\n'),
  }
}

function buildFridaySummaryEmail(params: {
  items: ReminderMovie[]
  name?: string | null
}) {
  const count = params.items.length
  const greeting = params.name ? `Hi ${params.name},` : 'Hi,'
  const wantListUrl = `${getReminderBaseUrl()}/me/want-list`

  return {
    subject:
      count === 1
        ? 'Screening NYC: 1 film from your want list is screening'
        : `Screening NYC: ${count} films from your want list are screening`,
    html: `
      <div style="font-family: Helvetica Neue, Arial, sans-serif; color: #111;">
        <p>${escapeHtml(greeting)}</p>
        <p>Here is your Friday summary of the ${pluralize(count, 'film')} from your want list that ${count === 1 ? 'is' : 'are'} currently on screen in NYC:</p>
        <ul style="padding-left: 20px;">
          ${buildReminderListHtml(params.items)}
        </ul>
        <p>
          <a href="${wantListUrl}" style="display: inline-block; padding: 12px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">
            Open want list
          </a>
        </p>
      </div>
    `,
    text: [
      greeting,
      '',
      `Here is your Friday summary of the ${pluralize(count, 'film')} from your want list that ${count === 1 ? 'is' : 'are'} currently on screen in NYC:`,
      '',
      buildReminderListText(params.items),
      '',
      `Open want list: ${wantListUrl}`,
    ].join('\n'),
  }
}

function buildDirectorTransitionEmail(params: {
  items: ReminderDirectorItem[]
  name?: string | null
}) {
  const count = params.items.length
  const greeting = params.name ? `Hi ${params.name},` : 'Hi,'
  const wantListUrl = `${getReminderBaseUrl()}/me/want-list?tab=directors`
  const totalMovies = params.items.reduce((sum, item) => sum + item.movies.length, 0)
  const subject =
    count === 1 && totalMovies === 1
      ? `Screening NYC: a film by ${params.items[0]?.person.name} is now screening`
      : `Screening NYC: ${count} directors from your want list have films screening`

  return {
    subject,
    html: `
      <div style="font-family: Helvetica Neue, Arial, sans-serif; color: #111;">
        <p>${escapeHtml(greeting)}</p>
        <p>The ${count === 1 ? 'director below now has' : 'directors below now have'} films screening in NYC:</p>
        <ul style="padding-left: 20px;">
          ${buildDirectorReminderListHtml(params.items)}
        </ul>
        <p>
          <a href="${wantListUrl}" style="display: inline-block; padding: 12px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">
            Open director want list
          </a>
        </p>
      </div>
    `,
    text: [
      greeting,
      '',
      `The ${count === 1 ? 'director below now has' : 'directors below now have'} films screening in NYC:`,
      '',
      buildDirectorReminderListText(params.items),
      '',
      `Open director want list: ${wantListUrl}`,
    ].join('\n'),
  }
}

function buildDirectorFridaySummaryEmail(params: {
  items: ReminderDirectorItem[]
  name?: string | null
}) {
  const count = params.items.length
  const greeting = params.name ? `Hi ${params.name},` : 'Hi,'
  const wantListUrl = `${getReminderBaseUrl()}/me/want-list?tab=directors`

  return {
    subject:
      count === 1
        ? 'Screening NYC: 1 director from your want list has films screening'
        : `Screening NYC: ${count} directors from your want list have films screening`,
    html: `
      <div style="font-family: Helvetica Neue, Arial, sans-serif; color: #111;">
        <p>${escapeHtml(greeting)}</p>
        <p>Here is your Friday summary of the ${pluralize(count, 'director')} from your want list that ${count === 1 ? 'currently has' : 'currently have'} films on screen in NYC:</p>
        <ul style="padding-left: 20px;">
          ${buildDirectorReminderListHtml(params.items)}
        </ul>
        <p>
          <a href="${wantListUrl}" style="display: inline-block; padding: 12px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">
            Open director want list
          </a>
        </p>
      </div>
    `,
    text: [
      greeting,
      '',
      `Here is your Friday summary of the ${pluralize(count, 'director')} from your want list that ${count === 1 ? 'currently has' : 'currently have'} films on screen in NYC:`,
      '',
      buildDirectorReminderListText(params.items),
      '',
      `Open director want list: ${wantListUrl}`,
    ].join('\n'),
  }
}

async function initializeAddedWhileOnScreenFlags(
  now: Date,
  options: ReminderRunOptions
) {
  const items = await prisma.watchlistItem.findMany({
    where: {
      addedWhileOnScreen: null,
    },
    select: {
      id: true,
      movie: {
        select: {
          showtimes: {
            where: getUpcomingShowtimeWhere(now),
            select: {
              id: true,
            },
            take: 1,
          },
        },
      },
    },
  })

  if (items.length === 0) {
    return 0
  }

  const onScreenIds = items
    .filter((item) => item.movie.showtimes.length > 0)
    .map((item) => item.id)
  const offScreenIds = items
    .filter((item) => item.movie.showtimes.length === 0)
    .map((item) => item.id)

  if (options.dryRun) {
    return items.length
  }

  if (onScreenIds.length > 0) {
    await prisma.watchlistItem.updateMany({
      where: {
        id: {
          in: onScreenIds,
        },
      },
      data: {
        addedWhileOnScreen: true,
      },
    })
  }

  if (offScreenIds.length > 0) {
    await prisma.watchlistItem.updateMany({
      where: {
        id: {
          in: offScreenIds,
        },
      },
      data: {
        addedWhileOnScreen: false,
      },
    })
  }

  return items.length
}

async function loadTransitionReminderGroups(now: Date): Promise<ReminderUserGroup[]> {
  const items = await prisma.watchlistItem.findMany({
    where: {
      addedWhileOnScreen: false,
      notificationDeliveries: {
        none: {},
      },
      movie: {
        showtimes: {
          some: getUpcomingShowtimeWhere(now),
        },
      },
      user: getEmailEnabledUserFilter(),
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          email: true,
          name: true,
        },
      },
      movie: {
        select: {
          id: true,
          title: true,
          showtimes: {
            where: getUpcomingShowtimeWhere(now),
            orderBy: {
              startTime: 'asc',
            },
            take: 2,
            select: {
              id: true,
              startTime: true,
              theater: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  const groups = new Map<string, ReminderUserGroup>()

  items.forEach((item) => {
    if (!item.user.email || item.movie.showtimes.length === 0) {
      return
    }

    const group =
      groups.get(item.userId) ||
      {
        userId: item.userId,
        email: item.user.email,
        name: item.user.name,
        items: [],
      }

    group.items.push({
      watchlistItemId: item.id,
      movie: item.movie,
    })
    groups.set(item.userId, group)
  })

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: sortReminderItems(group.items),
    }))
    .sort((a, b) => a.email.localeCompare(b.email))
}

async function loadFridaySummaryGroups(now: Date): Promise<ReminderUserGroup[]> {
  const summaryDateKey = getSummaryDateKey(now)
  const users = await prisma.user.findMany({
    where: {
      ...getEmailEnabledUserFilter(),
      watchlistSummaryDeliveries: {
        none: {
          summaryDateKey,
        },
      },
      watchlistItems: {
        some: {
          movie: {
            showtimes: {
              some: getUpcomingShowtimeWhere(now),
            },
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      watchlistItems: {
        where: {
          movie: {
            showtimes: {
              some: getUpcomingShowtimeWhere(now),
            },
          },
        },
        select: {
          id: true,
          movie: {
            select: {
              id: true,
              title: true,
              showtimes: {
                where: getUpcomingShowtimeWhere(now),
                orderBy: {
                  startTime: 'asc',
                },
                take: 2,
                select: {
                  id: true,
                  startTime: true,
                  theater: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  return users
    .map((user) => ({
      userId: user.id,
      email: user.email,
      name: user.name,
      items: sortReminderItems(
        user.watchlistItems
          .filter((item) => item.movie.showtimes.length > 0)
          .map((item) => ({
            watchlistItemId: item.id,
            movie: item.movie,
          }))
      ),
    }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => a.email.localeCompare(b.email))
}

async function loadDirectorTransitionReminderGroups(
  now: Date
): Promise<ReminderDirectorUserGroup[]> {
  const items = await prisma.directorWatchlistItem.findMany({
    where: {
      person: {
        movieLinks: {
          some: {
            kind: 'DIRECTOR',
            movie: {
              showtimes: {
                some: getUpcomingShowtimeWhere(now),
              },
            },
          },
        },
      },
      user: getEmailEnabledUserFilter(),
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          email: true,
          name: true,
        },
      },
      notificationDeliveries: {
        select: {
          movieId: true,
        },
      },
      person: {
        select: {
          id: true,
          name: true,
          movieLinks: {
            where: {
              kind: 'DIRECTOR',
              movie: {
                showtimes: {
                  some: getUpcomingShowtimeWhere(now),
                },
              },
            },
            select: {
              movie: {
                select: {
                  id: true,
                  title: true,
                  showtimes: {
                    where: getUpcomingShowtimeWhere(now),
                    orderBy: {
                      startTime: 'asc',
                    },
                    take: 2,
                    select: {
                      id: true,
                      startTime: true,
                      theater: {
                        select: {
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  const groups = new Map<string, ReminderDirectorUserGroup>()

  items.forEach((item) => {
    if (!item.user.email) {
      return
    }

    const deliveredMovieIds = new Set(
      item.notificationDeliveries.map((delivery) => delivery.movieId)
    )
    const pendingMovies = item.person.movieLinks
      .map((link) => link.movie)
      .filter(
        (movie) =>
          movie.showtimes.length > 0 && !deliveredMovieIds.has(movie.id)
      )
      .map((movie) => ({
        movieId: movie.id,
        title: movie.title,
        showtimes: movie.showtimes,
      }))

    if (pendingMovies.length === 0) {
      return
    }

    const group =
      groups.get(item.userId) ||
      {
        userId: item.userId,
        email: item.user.email,
        name: item.user.name,
        items: [],
      }

    group.items.push({
      directorWatchlistItemId: item.id,
      person: {
        id: item.person.id,
        name: item.person.name,
      },
      movies: pendingMovies,
    })
    groups.set(item.userId, group)
  })

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: sortDirectorReminderItems(group.items),
    }))
    .sort((a, b) => a.email.localeCompare(b.email))
}

async function loadDirectorFridaySummaryGroups(
  now: Date
): Promise<ReminderDirectorUserGroup[]> {
  const summaryDateKey = getSummaryDateKey(now)
  const users = await prisma.user.findMany({
    where: {
      ...getEmailEnabledUserFilter(),
      directorWatchlistSummaryDeliveries: {
        none: {
          summaryDateKey,
        },
      },
      directorWatchlistItems: {
        some: {
          person: {
            movieLinks: {
              some: {
                kind: 'DIRECTOR',
                movie: {
                  showtimes: {
                    some: getUpcomingShowtimeWhere(now),
                  },
                },
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      directorWatchlistItems: {
        select: {
          id: true,
          person: {
            select: {
              id: true,
              name: true,
              movieLinks: {
                where: {
                  kind: 'DIRECTOR',
                  movie: {
                    showtimes: {
                      some: getUpcomingShowtimeWhere(now),
                    },
                  },
                },
                select: {
                  movie: {
                    select: {
                      id: true,
                      title: true,
                      showtimes: {
                        where: getUpcomingShowtimeWhere(now),
                        orderBy: {
                          startTime: 'asc',
                        },
                        take: 2,
                        select: {
                          id: true,
                          startTime: true,
                          theater: {
                            select: {
                              name: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  return users
    .map((user) => ({
      userId: user.id,
      email: user.email,
      name: user.name,
      items: sortDirectorReminderItems(
        user.directorWatchlistItems
          .map((item) => ({
            directorWatchlistItemId: item.id,
            person: {
              id: item.person.id,
              name: item.person.name,
            },
            movies: item.person.movieLinks
              .map((link) => link.movie)
              .filter((movie) => movie.showtimes.length > 0)
              .map((movie) => ({
                movieId: movie.id,
                title: movie.title,
                showtimes: movie.showtimes,
              })),
          }))
          .filter((item) => item.movies.length > 0)
      ),
    }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => a.email.localeCompare(b.email))
}

async function sendTransitionReminders(
  groups: ReminderUserGroup[],
  options: ReminderRunOptions
) {
  let emailsSent = 0
  let deliveredItems = 0

  for (const group of groups) {
    const email = buildTransitionEmail({
      items: group.items,
      name: group.name,
    })

    if (options.dryRun) {
      console.log(
        `[watchlist-reminders][dry-run][transition] ${group.email} <- ${group.items.length} items`
      )
      emailsSent += 1
      deliveredItems += group.items.length
      continue
    }

    const resendMessageId = await sendEmail({
      to: group.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })

    await prisma.watchlistNotificationDelivery.createMany({
      data: group.items.map((item) => ({
        watchlistItemId: item.watchlistItemId,
        showtimeId: item.movie.showtimes[0].id,
        resendMessageId,
        sentToEmail: group.email,
      })),
      skipDuplicates: true,
    })

    emailsSent += 1
    deliveredItems += group.items.length
  }

  return {
    emailsSent,
    deliveredItems,
  }
}

async function sendFridaySummaryReminders(
  groups: ReminderUserGroup[],
  options: ReminderRunOptions,
  now: Date
) {
  let emailsSent = 0
  const summaryDateKey = getSummaryDateKey(now)

  for (const group of groups) {
    const email = buildFridaySummaryEmail({
      items: group.items,
      name: group.name,
    })

    if (options.dryRun) {
      console.log(
        `[watchlist-reminders][dry-run][summary] ${group.email} <- ${group.items.length} items`
      )
      emailsSent += 1
      continue
    }

    const resendMessageId = await sendEmail({
      to: group.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })

    await prisma.watchlistSummaryDelivery.create({
      data: {
        userId: group.userId,
        summaryDateKey,
        resendMessageId,
        sentToEmail: group.email,
      },
    })

    emailsSent += 1
  }

  return {
    emailsSent,
  }
}

async function sendDirectorTransitionReminders(
  groups: ReminderDirectorUserGroup[],
  options: ReminderRunOptions
) {
  let emailsSent = 0
  let deliveredItems = 0

  for (const group of groups) {
    const email = buildDirectorTransitionEmail({
      items: group.items,
      name: group.name,
    })

    if (options.dryRun) {
      console.log(
        `[watchlist-reminders][dry-run][director-transition] ${group.email} <- ${group.items.length} directors`
      )
      emailsSent += 1
      deliveredItems += group.items.reduce((sum, item) => sum + item.movies.length, 0)
      continue
    }

    const resendMessageId = await sendEmail({
      to: group.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })

    await prisma.directorWatchlistNotificationDelivery.createMany({
      data: group.items.flatMap((item) =>
        item.movies.map((movie) => ({
          directorWatchlistItemId: item.directorWatchlistItemId,
          movieId: movie.movieId,
          resendMessageId,
          sentToEmail: group.email,
        }))
      ),
      skipDuplicates: true,
    })

    emailsSent += 1
    deliveredItems += group.items.reduce((sum, item) => sum + item.movies.length, 0)
  }

  return {
    emailsSent,
    deliveredItems,
  }
}

async function sendDirectorFridaySummaryReminders(
  groups: ReminderDirectorUserGroup[],
  options: ReminderRunOptions,
  now: Date
) {
  let emailsSent = 0
  const summaryDateKey = getSummaryDateKey(now)

  for (const group of groups) {
    const email = buildDirectorFridaySummaryEmail({
      items: group.items,
      name: group.name,
    })

    if (options.dryRun) {
      console.log(
        `[watchlist-reminders][dry-run][director-summary] ${group.email} <- ${group.items.length} directors`
      )
      emailsSent += 1
      continue
    }

    const resendMessageId = await sendEmail({
      to: group.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })

    await prisma.directorWatchlistSummaryDelivery.create({
      data: {
        userId: group.userId,
        summaryDateKey,
        resendMessageId,
        sentToEmail: group.email,
      },
    })

    emailsSent += 1
  }

  return {
    emailsSent,
  }
}

export async function runWatchlistReminderJob(
  options: ReminderRunOptions = {}
): Promise<WatchlistReminderRunResult> {
  const now = options.now || new Date()

  if (!options.dryRun && !isMagicLinkConfigured()) {
    throw new Error('Email delivery is not configured for watchlist reminders.')
  }

  if (!options.force && !isNoonWindow(now)) {
    return {
      dryRun: Boolean(options.dryRun),
      executedMode: 'skipped',
      initializedWatchlistItems: 0,
      transitionCandidates: 0,
      transitionEmailsSent: 0,
      transitionItemsDelivered: 0,
      directorTransitionCandidates: 0,
      directorTransitionEmailsSent: 0,
      directorTransitionItemsDelivered: 0,
      summaryCandidates: 0,
      summaryEmailsSent: 0,
      directorSummaryCandidates: 0,
      directorSummaryEmailsSent: 0,
      skippedReason: 'Current America/New_York time is outside the noon reminder window.',
    }
  }

  const initializedWatchlistItems = await initializeAddedWhileOnScreenFlags(now, options)
  const executionMode = getExecutionMode(options, now)

  if (executionMode === 'summary') {
    const [groups, directorGroups] = await Promise.all([
      loadFridaySummaryGroups(now),
      loadDirectorFridaySummaryGroups(now),
    ])
    const [summaryResult, directorSummaryResult] = await Promise.all([
      sendFridaySummaryReminders(groups, options, now),
      sendDirectorFridaySummaryReminders(directorGroups, options, now),
    ])

    return {
      dryRun: Boolean(options.dryRun),
      executedMode: 'summary',
      initializedWatchlistItems,
      transitionCandidates: 0,
      transitionEmailsSent: 0,
      transitionItemsDelivered: 0,
      directorTransitionCandidates: 0,
      directorTransitionEmailsSent: 0,
      directorTransitionItemsDelivered: 0,
      summaryCandidates: groups.reduce((count, group) => count + group.items.length, 0),
      summaryEmailsSent: summaryResult.emailsSent,
      directorSummaryCandidates: directorGroups.reduce(
        (count, group) => count + group.items.length,
        0
      ),
      directorSummaryEmailsSent: directorSummaryResult.emailsSent,
    }
  }

  const [groups, directorGroups] = await Promise.all([
    loadTransitionReminderGroups(now),
    loadDirectorTransitionReminderGroups(now),
  ])
  const [transitionResult, directorTransitionResult] = await Promise.all([
    sendTransitionReminders(groups, options),
    sendDirectorTransitionReminders(directorGroups, options),
  ])

  return {
    dryRun: Boolean(options.dryRun),
    executedMode: 'transition',
    initializedWatchlistItems,
    transitionCandidates: groups.reduce((count, group) => count + group.items.length, 0),
    transitionEmailsSent: transitionResult.emailsSent,
    transitionItemsDelivered: transitionResult.deliveredItems,
    directorTransitionCandidates: directorGroups.reduce(
      (count, group) =>
        count + group.items.reduce((groupCount, item) => groupCount + item.movies.length, 0),
      0
    ),
    directorTransitionEmailsSent: directorTransitionResult.emailsSent,
    directorTransitionItemsDelivered: directorTransitionResult.deliveredItems,
    summaryCandidates: 0,
    summaryEmailsSent: 0,
    directorSummaryCandidates: 0,
    directorSummaryEmailsSent: 0,
  }
}
