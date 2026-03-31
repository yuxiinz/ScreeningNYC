import { DateTime } from 'luxon'

import { sendEmail } from '@/lib/auth/email'
import { getReminderBaseUrl, isMagicLinkConfigured } from '@/lib/auth/env'
import { prisma } from '@/lib/prisma'
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

export type WatchlistReminderRunResult = {
  dryRun: boolean
  executedMode: 'summary' | 'transition' | 'skipped'
  initializedWatchlistItems: number
  transitionCandidates: number
  transitionEmailsSent: number
  transitionItemsDelivered: number
  summaryCandidates: number
  summaryEmailsSent: number
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

function getUpcomingShowtimeWhere(now: Date) {
  return {
    startTime: {
      gt: now,
    },
    status: 'SCHEDULED' as const,
  }
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
      summaryCandidates: 0,
      summaryEmailsSent: 0,
      skippedReason: 'Current America/New_York time is outside the noon reminder window.',
    }
  }

  const initializedWatchlistItems = await initializeAddedWhileOnScreenFlags(now, options)
  const executionMode = getExecutionMode(options, now)

  if (executionMode === 'summary') {
    const groups = await loadFridaySummaryGroups(now)
    const summaryResult = await sendFridaySummaryReminders(groups, options, now)

    return {
      dryRun: Boolean(options.dryRun),
      executedMode: 'summary',
      initializedWatchlistItems,
      transitionCandidates: 0,
      transitionEmailsSent: 0,
      transitionItemsDelivered: 0,
      summaryCandidates: groups.reduce((count, group) => count + group.items.length, 0),
      summaryEmailsSent: summaryResult.emailsSent,
    }
  }

  const groups = await loadTransitionReminderGroups(now)
  const transitionResult = await sendTransitionReminders(groups, options)

  return {
    dryRun: Boolean(options.dryRun),
    executedMode: 'transition',
    initializedWatchlistItems,
    transitionCandidates: groups.reduce((count, group) => count + group.items.length, 0),
    transitionEmailsSent: transitionResult.emailsSent,
    transitionItemsDelivered: transitionResult.deliveredItems,
    summaryCandidates: 0,
    summaryEmailsSent: 0,
  }
}
