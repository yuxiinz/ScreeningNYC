import { DateTime } from 'luxon'

import { sendEmail } from '@/lib/auth/email'
import { isMagicLinkConfigured } from '@/lib/auth/env'
import { prisma } from '@/lib/prisma'
import { getUpcomingShowtimeWhere } from '@/lib/showtime/queries'
import { APP_TIMEZONE, getDateKeyInAppTimezone } from '@/lib/timezone'
import {
  buildDirectorReminderEmail,
  buildMovieReminderEmail,
  countDirectorReminderMovies,
  type ReminderDirectorContentItem,
  type ReminderMovieContentItem,
} from '@/lib/watchlist-reminders/content'

type ReminderRunOptions = {
  dryRun?: boolean
  force?: boolean
  now?: Date
  mode?: 'auto' | 'summary' | 'transition'
}

type ReminderMovie = ReminderMovieContentItem & {
  watchlistItemId: number
  movie: ReminderMovieContentItem['movie'] & {
    showtimes: Array<
      ReminderMovieContentItem['movie']['showtimes'][number] & {
        id: number
      }
    >
  }
}

type ReminderDirectorItem = ReminderDirectorContentItem & {
  directorWatchlistItemId: number
  movies: Array<
    ReminderDirectorContentItem['movies'][number] & {
      showtimes: Array<
        ReminderDirectorContentItem['movies'][number]['showtimes'][number] & {
          id: number
        }
      >
    }
  >
}

type ReminderGroup<TItem> = {
  userId: string
  email: string
  name: string | null
  items: TItem[]
}

type ReminderUserGroup = ReminderGroup<ReminderMovie>
type ReminderDirectorUserGroup = ReminderGroup<ReminderDirectorItem>

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

function sortGroupsByEmail<TGroup extends { email: string }>(groups: TGroup[]) {
  return [...groups].sort((a, b) => a.email.localeCompare(b.email))
}

function getOrCreateReminderGroup<TItem>(
  groups: Map<string, ReminderGroup<TItem>>,
  userId: string,
  email: string,
  name: string | null
) {
  const existing = groups.get(userId)

  if (existing) {
    return existing
  }

  const group: ReminderGroup<TItem> = {
    userId,
    email,
    name,
    items: [],
  }

  groups.set(userId, group)

  return group
}

async function sendReminderEmails<TItem>({
  buildEmail,
  countDeliveredItems,
  formatDryRunLog,
  groups,
  options,
  persistDeliveries,
}: {
  buildEmail: (group: ReminderGroup<TItem>) => {
    subject: string
    html: string
    text: string
  }
  countDeliveredItems: (group: ReminderGroup<TItem>) => number
  formatDryRunLog: (group: ReminderGroup<TItem>) => string
  groups: ReminderGroup<TItem>[]
  options: ReminderRunOptions
  persistDeliveries: (
    group: ReminderGroup<TItem>,
    resendMessageId: string | null | undefined
  ) => Promise<void>
}) {
  let emailsSent = 0
  let deliveredItems = 0

  for (const group of groups) {
    const email = buildEmail(group)
    const deliveredCount = countDeliveredItems(group)

    if (options.dryRun) {
      console.log(formatDryRunLog(group))
      emailsSent += 1
      deliveredItems += deliveredCount
      continue
    }

    const resendMessageId = await sendEmail({
      to: group.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })

    await persistDeliveries(group, resendMessageId)

    emailsSent += 1
    deliveredItems += deliveredCount
  }

  return {
    emailsSent,
    deliveredItems,
  }
}

async function sendMovieReminderEmails(
  mode: 'summary' | 'transition',
  groups: ReminderUserGroup[],
  options: ReminderRunOptions,
  now: Date
) {
  if (mode === 'summary') {
    const summaryDateKey = getSummaryDateKey(now)

    return sendReminderEmails({
      groups,
      options,
      buildEmail: (group) =>
        buildMovieReminderEmail({
          items: group.items,
          mode: 'summary',
          name: group.name,
        }),
      countDeliveredItems: (group) => group.items.length,
      formatDryRunLog: (group) =>
        `[watchlist-reminders][dry-run][summary] ${group.email} <- ${group.items.length} items`,
      persistDeliveries: async (group, resendMessageId) => {
        await prisma.watchlistSummaryDelivery.create({
          data: {
            userId: group.userId,
            summaryDateKey,
            resendMessageId,
            sentToEmail: group.email,
          },
        })
      },
    })
  }

  return sendReminderEmails({
    groups,
    options,
    buildEmail: (group) =>
      buildMovieReminderEmail({
        items: group.items,
        mode: 'transition',
        name: group.name,
      }),
    countDeliveredItems: (group) => group.items.length,
    formatDryRunLog: (group) =>
      `[watchlist-reminders][dry-run][transition] ${group.email} <- ${group.items.length} items`,
    persistDeliveries: async (group, resendMessageId) => {
      await prisma.watchlistNotificationDelivery.createMany({
        data: group.items.map((item) => ({
          watchlistItemId: item.watchlistItemId,
          showtimeId: item.movie.showtimes[0].id,
          resendMessageId,
          sentToEmail: group.email,
        })),
        skipDuplicates: true,
      })
    },
  })
}

async function sendDirectorReminderEmails(
  mode: 'summary' | 'transition',
  groups: ReminderDirectorUserGroup[],
  options: ReminderRunOptions,
  now: Date
) {
  if (mode === 'summary') {
    const summaryDateKey = getSummaryDateKey(now)

    return sendReminderEmails({
      groups,
      options,
      buildEmail: (group) =>
        buildDirectorReminderEmail({
          items: group.items,
          mode: 'summary',
          name: group.name,
        }),
      countDeliveredItems: (group) => countDirectorReminderMovies(group.items),
      formatDryRunLog: (group) =>
        `[watchlist-reminders][dry-run][director-summary] ${group.email} <- ${group.items.length} directors`,
      persistDeliveries: async (group, resendMessageId) => {
        await prisma.directorWatchlistSummaryDelivery.create({
          data: {
            userId: group.userId,
            summaryDateKey,
            resendMessageId,
            sentToEmail: group.email,
          },
        })
      },
    })
  }

  return sendReminderEmails({
    groups,
    options,
    buildEmail: (group) =>
      buildDirectorReminderEmail({
        items: group.items,
        mode: 'transition',
        name: group.name,
      }),
    countDeliveredItems: (group) => countDirectorReminderMovies(group.items),
    formatDryRunLog: (group) =>
      `[watchlist-reminders][dry-run][director-transition] ${group.email} <- ${group.items.length} directors`,
    persistDeliveries: async (group, resendMessageId) => {
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
    },
  })
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

    const group = getOrCreateReminderGroup(
      groups,
      item.userId,
      item.user.email,
      item.user.name
    )

    group.items.push({
      watchlistItemId: item.id,
      movie: item.movie,
    })
  })

  return sortGroupsByEmail([...groups.values()])
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
      items: user.watchlistItems
        .filter((item) => item.movie.showtimes.length > 0)
        .map((item) => ({
          watchlistItemId: item.id,
          movie: item.movie,
        })),
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

    const group = getOrCreateReminderGroup(
      groups,
      item.userId,
      item.user.email,
      item.user.name
    )

    group.items.push({
      directorWatchlistItemId: item.id,
      person: {
        id: item.person.id,
        name: item.person.name,
      },
      movies: pendingMovies,
    })
  })

  return sortGroupsByEmail([...groups.values()])
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
      items: user.directorWatchlistItems
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
        .filter((item) => item.movies.length > 0),
    }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => a.email.localeCompare(b.email))
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
      sendMovieReminderEmails('summary', groups, options, now),
      sendDirectorReminderEmails('summary', directorGroups, options, now),
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
    sendMovieReminderEmails('transition', groups, options, now),
    sendDirectorReminderEmails('transition', directorGroups, options, now),
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
