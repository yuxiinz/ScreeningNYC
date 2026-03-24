export const APP_TIMEZONE = 'America/New_York'

const DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value)
}

export function getDateKeyInAppTimezone(value: Date | string | number): string {
  const parts = DATE_KEY_FORMATTER.formatToParts(toDate(value))
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('Failed to build date key in app timezone')
  }

  return `${year}-${month}-${day}`
}

export function getTodayInAppTimezone(now: Date = new Date()): string {
  return getDateKeyInAppTimezone(now)
}

export function formatTimeInAppTimezone(
  value: Date | string | number
): string {
  return TIME_FORMATTER.format(toDate(value))
}

export function formatDateKeyInAppTimezone(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))

  return DATE_LABEL_FORMATTER.format(utcNoon).toUpperCase()
}
