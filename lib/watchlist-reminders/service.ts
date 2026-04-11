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
type ReminderMode = 'summary' | 'transition'
type ReminderGroupSeed<TItem> = {
  userId: string
  email?: string | null
  name: string | null
  items: TItem[]
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

const REMINDER_USER_SELECT = {
  email: true,
  name: true,
} as const

function getUpcomingReminderMovieWhere(now: Date) {
  return {
    showtimes: {
      some: getUpcomingShowtimeWhere(now),
    },
  }
}

function getReminderShowtimesSelect(now: Date) {
  return {
    where: getUpcomingShowtimeWhere(now),
    orderBy: {
      startTime: 'asc' as const,
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
  }
}

function getReminderMovieSelect(now: Date) {
  return {
    id: true,
    title: true,
    showtimes: getReminderShowtimesSelect(now),
  }
}

function getDirectorReminderMovieLinksWhere(now: Date) {
  return {
    kind: 'DIRECTOR' as const,
    movie: getUpcomingReminderMovieWhere(now),
  }
}

function getDirectorReminderPersonSelect(now: Date) {
  return {
    id: true,
    name: true,
    movieLinks: {
      where: getDirectorReminderMovieLinksWhere(now),
      select: {
        movie: {
          select: getReminderMovieSelect(now),
        },
      },
    },
  }
}

function toReminderMovie(item: {
  id: number
  movie: ReminderMovie['movie']
}): ReminderMovie {
  return {
    watchlistItemId: item.id,
    movie: item.movie,
  }
}

function toReminderDirectorMovies(
  movies: Array<{
    id: number
    title: string
    showtimes: ReminderDirectorItem['movies'][number]['showtimes']
  }>,
  deliveredMovieIds = new Set<number>()
) {
  return movies
    .filter(
      (movie) => movie.showtimes.length > 0 && !deliveredMovieIds.has(movie.id)
    )
    .map((movie) => ({
      movieId: movie.id,
      title: movie.title,
      showtimes: movie.showtimes,
    }))
}

function toReminderDirectorItem(
  itemId: number,
  person: ReminderDirectorItem['person'],
  movies: ReminderDirectorItem['movies']
): ReminderDirectorItem {
  return {
    directorWatchlistItemId: itemId,
    person,
    movies,
  }
}

function countReminderGroups<TItem>(
  groups: ReminderGroup<TItem>[],
  countItems: (items: TItem[]) => number = (items) => items.length
) {
  return groups.reduce((count, group) => count + countItems(group.items), 0)
}

function getExecutionMode(options: ReminderRunOptions, now: Date) {
  if (options.mode === 'summary' || options.mode === 'transition') return options.mode

  const localNow = DateTime.fromJSDate(now).setZone(APP_TIMEZONE)
  return (
    (localNow.weekday === 5 && localNow.hour === 12) || (options.force && localNow.weekday === 5)
  )
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
  if (existing) return existing

  const group: ReminderGroup<TItem> = {
    userId,
    email,
    name,
    items: [],
  }

  groups.set(userId, group)

  return group
}

function buildReminderGroups<TSource, TItem>(
  sources: TSource[],
  getSeed: (source: TSource) => ReminderGroupSeed<TItem>
) {
  const groups = new Map<string, ReminderGroup<TItem>>()

  sources.forEach((source) => {
    const seed = getSeed(source)

    if (!seed.email || seed.items.length === 0) {
      return
    }

    const group = getOrCreateReminderGroup(
      groups,
      seed.userId,
      seed.email,
      seed.name
    )

    group.items.push(...seed.items)
  })

  return sortGroupsByEmail([...groups.values()])
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
  ) => Promise<unknown>
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

type ReminderSenderConfig<TItem> = {
  buildEmail: (group: ReminderGroup<TItem>, mode: ReminderMode) => {
    subject: string
    html: string
    text: string
  }
  countDeliveredItems: (group: ReminderGroup<TItem>) => number
  formatDryRunLog: (group: ReminderGroup<TItem>, mode: ReminderMode) => string
  persistSummaryDelivery: (
    group: ReminderGroup<TItem>,
    resendMessageId: string | null | undefined,
    summaryDateKey: string
  ) => Promise<unknown>
  persistTransitionDelivery: (
    group: ReminderGroup<TItem>,
    resendMessageId: string | null | undefined
  ) => Promise<unknown>
}

const movieReminderSender: ReminderSenderConfig<ReminderMovie> = {
  buildEmail: (group, mode) =>
    buildMovieReminderEmail({
      items: group.items,
      mode,
      name: group.name,
    }),
  countDeliveredItems: (group) => group.items.length,
  formatDryRunLog: (group, mode) =>
    `[watchlist-reminders][dry-run][${mode}] ${group.email} <- ${group.items.length} items`,
  persistSummaryDelivery: (group, resendMessageId, summaryDateKey) =>
    prisma.watchlistSummaryDelivery.create({
      data: {
        userId: group.userId,
        summaryDateKey,
        resendMessageId,
        sentToEmail: group.email,
      },
    }),
  persistTransitionDelivery: (group, resendMessageId) =>
    prisma.watchlistNotificationDelivery.createMany({
      data: group.items.map((item) => ({
        watchlistItemId: item.watchlistItemId,
        showtimeId: item.movie.showtimes[0].id,
        resendMessageId,
        sentToEmail: group.email,
      })),
      skipDuplicates: true,
    }),
}

const directorReminderSender: ReminderSenderConfig<ReminderDirectorItem> = {
  buildEmail: (group, mode) =>
    buildDirectorReminderEmail({
      items: group.items,
      mode,
      name: group.name,
    }),
  countDeliveredItems: (group) => countDirectorReminderMovies(group.items),
  formatDryRunLog: (group, mode) =>
    `[watchlist-reminders][dry-run][director-${mode}] ${group.email} <- ${group.items.length} directors`,
  persistSummaryDelivery: (group, resendMessageId, summaryDateKey) =>
    prisma.directorWatchlistSummaryDelivery.create({
      data: {
        userId: group.userId,
        summaryDateKey,
        resendMessageId,
        sentToEmail: group.email,
      },
    }),
  persistTransitionDelivery: (group, resendMessageId) =>
    prisma.directorWatchlistNotificationDelivery.createMany({
      data: group.items.flatMap((item) =>
        item.movies.map((movie) => ({
          directorWatchlistItemId: item.directorWatchlistItemId,
          movieId: movie.movieId,
          resendMessageId,
          sentToEmail: group.email,
        }))
      ),
      skipDuplicates: true,
    }),
}

async function sendConfiguredReminderEmails<TItem>(
  mode: ReminderMode,
  groups: ReminderGroup<TItem>[],
  options: ReminderRunOptions,
  now: Date,
  config: ReminderSenderConfig<TItem>
) {
  const summaryDateKey = mode === 'summary' ? getDateKeyInAppTimezone(now) : null

  return sendReminderEmails({
    groups,
    options,
    buildEmail: (group) => config.buildEmail(group, mode),
    countDeliveredItems: config.countDeliveredItems,
    formatDryRunLog: (group) => config.formatDryRunLog(group, mode),
    persistDeliveries: (group, resendMessageId) =>
      mode === 'summary' && summaryDateKey
        ? config.persistSummaryDelivery(group, resendMessageId, summaryDateKey)
        : config.persistTransitionDelivery(group, resendMessageId),
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
            take: 1,
            select: {
              id: true,
            },
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
  const movieWhere = getUpcomingReminderMovieWhere(now)
  const movieSelect = getReminderMovieSelect(now)

  const items = await prisma.watchlistItem.findMany({
    where: {
      addedWhileOnScreen: false,
      notificationDeliveries: {
        none: {},
      },
      movie: movieWhere,
      user: getEmailEnabledUserFilter(),
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: REMINDER_USER_SELECT,
      },
      movie: {
        select: movieSelect,
      },
    },
  })

  return buildReminderGroups(items, (item) => ({
    userId: item.userId,
    email: item.user.email,
    name: item.user.name,
    items: item.movie.showtimes.length > 0 ? [toReminderMovie(item)] : [],
  }))
}

async function loadFridaySummaryGroups(now: Date): Promise<ReminderUserGroup[]> {
  const summaryDateKey = getDateKeyInAppTimezone(now)
  const movieWhere = getUpcomingReminderMovieWhere(now)
  const movieSelect = getReminderMovieSelect(now)
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
          movie: movieWhere,
        },
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      watchlistItems: {
        where: {
          movie: movieWhere,
        },
        select: {
          id: true,
          movie: {
            select: movieSelect,
          },
        },
      },
    },
  })

  return buildReminderGroups(users, (user) => ({
    userId: user.id,
    email: user.email,
    name: user.name,
    items: user.watchlistItems.flatMap((item) =>
      item.movie.showtimes.length > 0 ? [toReminderMovie(item)] : []
    ),
  }))
}

async function loadDirectorTransitionReminderGroups(
  now: Date
): Promise<ReminderDirectorUserGroup[]> {
  const movieLinksWhere = getDirectorReminderMovieLinksWhere(now)
  const personSelect = getDirectorReminderPersonSelect(now)

  const items = await prisma.directorWatchlistItem.findMany({
    where: {
      person: {
        movieLinks: {
          some: movieLinksWhere,
        },
      },
      user: getEmailEnabledUserFilter(),
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: REMINDER_USER_SELECT,
      },
      notificationDeliveries: {
        select: {
          movieId: true,
        },
      },
      person: {
        select: personSelect,
      },
    },
  })

  return buildReminderGroups(items, (item) => {
    const deliveredMovieIds = new Set(
      item.notificationDeliveries.map((delivery) => delivery.movieId)
    )
    const pendingMovies = toReminderDirectorMovies(
      item.person.movieLinks.map((link) => link.movie),
      deliveredMovieIds
    )

    return {
      userId: item.userId,
      email: item.user.email,
      name: item.user.name,
      items: pendingMovies.length
        ? [
            toReminderDirectorItem(
              item.id,
              {
                id: item.person.id,
                name: item.person.name,
              },
              pendingMovies
            ),
          ]
        : [],
    }
  })
}

async function loadDirectorFridaySummaryGroups(
  now: Date
): Promise<ReminderDirectorUserGroup[]> {
  const summaryDateKey = getDateKeyInAppTimezone(now)
  const movieLinksWhere = getDirectorReminderMovieLinksWhere(now)
  const personSelect = getDirectorReminderPersonSelect(now)
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
              some: movieLinksWhere,
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
            select: personSelect,
          },
        },
      },
    },
  })

  return buildReminderGroups(users, (user) => ({
    userId: user.id,
    email: user.email,
    name: user.name,
    items: user.directorWatchlistItems.flatMap((item) => {
      const movies = toReminderDirectorMovies(
        item.person.movieLinks.map((link) => link.movie)
      )

      return movies.length
        ? [
            toReminderDirectorItem(
              item.id,
              {
                id: item.person.id,
                name: item.person.name,
              },
              movies
            ),
          ]
        : []
    }),
  }))
}

export async function runWatchlistReminderJob(
  options: ReminderRunOptions = {}
): Promise<WatchlistReminderRunResult> {
  const now = options.now || new Date()

  if (!options.dryRun && !isMagicLinkConfigured()) {
    throw new Error('Email delivery is not configured for watchlist reminders.')
  }

  if (
    !options.force &&
    DateTime.fromJSDate(now).setZone(APP_TIMEZONE).hour !== 12
  ) {
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
      sendConfiguredReminderEmails('summary', groups, options, now, movieReminderSender),
      sendConfiguredReminderEmails(
        'summary',
        directorGroups,
        options,
        now,
        directorReminderSender
      ),
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
      summaryCandidates: countReminderGroups(groups),
      summaryEmailsSent: summaryResult.emailsSent,
      directorSummaryCandidates: countReminderGroups(directorGroups),
      directorSummaryEmailsSent: directorSummaryResult.emailsSent,
    }
  }

  const [groups, directorGroups] = await Promise.all([
    loadTransitionReminderGroups(now),
    loadDirectorTransitionReminderGroups(now),
  ])
  const [transitionResult, directorTransitionResult] = await Promise.all([
    sendConfiguredReminderEmails(
      'transition',
      groups,
      options,
      now,
      movieReminderSender
    ),
    sendConfiguredReminderEmails(
      'transition',
      directorGroups,
      options,
      now,
      directorReminderSender
    ),
  ])

  return {
    dryRun: Boolean(options.dryRun),
    executedMode: 'transition',
    initializedWatchlistItems,
    transitionCandidates: countReminderGroups(groups),
    transitionEmailsSent: transitionResult.emailsSent,
    transitionItemsDelivered: transitionResult.deliveredItems,
    directorTransitionCandidates: countReminderGroups(
      directorGroups,
      countDirectorReminderMovies
    ),
    directorTransitionEmailsSent: directorTransitionResult.emailsSent,
    directorTransitionItemsDelivered: directorTransitionResult.deliveredItems,
    summaryCandidates: 0,
    summaryEmailsSent: 0,
    directorSummaryCandidates: 0,
    directorSummaryEmailsSent: 0,
  }
}
