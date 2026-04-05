// lib/ingest/core/datetime.ts

import { DateTime } from 'luxon'
import { normalizeWhitespace } from './text'

export type ParsedTimeParts = {
  hour: number
  minute: number
}

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

const WEEKDAY_PATTERN =
  '(?:sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)'

function stripHtml(input?: string | null): string {
  return (input || '').replace(/<[^>]+>/g, ' ')
}

export function normalizeDateLabel(input?: string | null): string {
  let s = normalizeWhitespace(stripHtml(input))
  if (!s) return ''

  s = s.replace(/\u00a0/g, ' ')
  s = s.replace(/\s+/g, ' ')
  s = s.replace(/\s*,\s*/g, ', ')
  s = s.replace(/\s+/g, ' ')
  s = s.trim()

  return s
}

export function normalizeTimeLabel(input?: string | null): string {
  let s = normalizeWhitespace(stripHtml(input))
  if (!s) return ''

  s = s.replace(/\u00a0/g, ' ')

  s = s.replace(/\ba\.\s*m\./gi, 'AM')
  s = s.replace(/\bp\.\s*m\./gi, 'PM')
  s = s.replace(/\ba\.m\./gi, 'AM')
  s = s.replace(/\bp\.m\./gi, 'PM')
  s = s.replace(/\ba\s*m\b/gi, 'AM')
  s = s.replace(/\bp\s*m\b/gi, 'PM')

  s = s.replace(/(\d)(am|pm)\b/gi, '$1 $2')
  s = s.replace(/(\d:\d{2})(am|pm)\b/gi, '$1 $2')

  s = s.replace(/\.(?=\d)/g, ':')
  s = s.replace(/\./g, ' ')

  s = s.replace(/^(.*?)(am|pm)$/i, (_, a, b) => `${a.trim()} ${b.toUpperCase()}`)
  s = s.replace(/\bam\b/gi, 'AM')
  s = s.replace(/\bpm\b/gi, 'PM')
  s = s.replace(/\s+/g, ' ')
  s = s.trim()

  return s
}

export function inferScreeningYear(
  month: number,
  day: number,
  now: Date = new Date()
): number {
  const current = DateTime.fromJSDate(now).startOf('day')
  const currentYear = current.year

  const candidates = [
    DateTime.fromObject({ year: currentYear - 1, month, day }).startOf('day'),
    DateTime.fromObject({ year: currentYear, month, day }).startOf('day'),
    DateTime.fromObject({ year: currentYear + 1, month, day }).startOf('day'),
  ].filter((dt) => dt.isValid)

  if (!candidates.length) {
    return currentYear
  }

  let best = candidates[0]
  let bestDistance = Math.abs(best.diff(current, 'days').days)

  for (const candidate of candidates.slice(1)) {
    const distance = Math.abs(candidate.diff(current, 'days').days)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }

  return best.year
}

function monthNameToNumber(monthText: string): number | undefined {
  return MONTH_MAP[monthText.toLowerCase()]
}

function tryBuildDate(
  monthText: string,
  dayText: string,
  yearText?: string | null,
  now: Date = new Date()
): Date | null {
  const month = monthNameToNumber(monthText)
  const day = Number(dayText)

  if (!month || !Number.isFinite(day) || day < 1 || day > 31) {
    return null
  }

  const year = yearText ? Number(yearText) : inferScreeningYear(month, day, now)
  if (!Number.isFinite(year)) return null

  const dt = DateTime.fromObject({
    year,
    month,
    day,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  })

  return dt.isValid ? dt.toJSDate() : null
}

export function parseDateLabel(
  dateText?: string | null,
  now: Date = new Date()
): Date | null {
  const s = normalizeDateLabel(dateText)
  if (!s) return null

  const patterns: RegExp[] = [
    new RegExp(
      `^(?:${WEEKDAY_PATTERN})\\s+([A-Za-z]+)\\s+(\\d{1,2})$`,
      'i'
    ),

    new RegExp(
      `^(?:${WEEKDAY_PATTERN}),?\\s+([A-Za-z]+)\\s+(\\d{1,2})$`,
      'i'
    ),

    new RegExp(
      `^(?:${WEEKDAY_PATTERN}),?\\s+([A-Za-z]+)\\s+(\\d{1,2}),\\s*(\\d{4})$`,
      'i'
    ),

    /^([A-Za-z]+)\s+(\d{1,2})$/i,

    /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/i,
  ]

  for (const pattern of patterns) {
    const match = s.match(pattern)
    if (!match) continue

    const monthText = match[1]
    const dayText = match[2]
    const yearText = match[3]

    const result = tryBuildDate(monthText, dayText, yearText, now)
    if (result) return result
  }

  return null
}

export function parseTimeLabel(timeText?: string | null): ParsedTimeParts | null {
  const s = normalizeTimeLabel(timeText)
  if (!s) return null

  let match = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (match) {
    let hour = Number(match[1])
    const minute = Number(match[2])
    const meridiem = match[3].toUpperCase()

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return null
    }

    if (meridiem === 'AM') {
      if (hour === 12) hour = 0
    } else {
      if (hour !== 12) hour += 12
    }

    return { hour, minute }
  }

  match = s.match(/^(\d{1,2})\s*(AM|PM)$/i)
  if (match) {
    let hour = Number(match[1])
    const meridiem = match[2].toUpperCase()

    if (hour < 1 || hour > 12) {
      return null
    }

    if (meridiem === 'AM') {
      if (hour === 12) hour = 0
    } else {
      if (hour !== 12) hour += 12
    }

    return { hour, minute: 0 }
  }

  match = s.match(/^(\d{1,2}):(\d{2})$/)
  if (match) {
    const hour = Number(match[1])
    const minute = Number(match[2])

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null
    }

    return { hour, minute }
  }

  return null
}

export function combineDateAndTime(
  date: Date,
  timeText?: string | null
): Date | null {
  const time = parseTimeLabel(timeText)
  if (!time) return null

  const base = DateTime.fromJSDate(date)

  const dt = base.set({
    hour: time.hour,
    minute: time.minute,
    second: 0,
    millisecond: 0,
  })

  return dt.isValid ? dt.toJSDate() : null
}

export function parseShowtime(input: {
  dateText?: string | null
  timeText?: string | null
  now?: Date
}): Date | null {
  const date = parseDateLabel(input.dateText, input.now)
  if (!date) return null

  return combineDateAndTime(date, input.timeText)
}

export function buildShowtimeRaw(
  dateText?: string | null,
  timeText?: string | null
): string {
  const parsed = parseShowtime({
    dateText,
    timeText,
  })

  if (parsed) {
    return formatShowtimeRaw(parsed)
  }

  return `${normalizeWhitespace(dateText)} ${normalizeWhitespace(timeText)}`.trim()
}

export function formatDateForRaw(date: Date): string {
  return DateTime.fromJSDate(date).toFormat('cccc, LLLL d, yyyy')
}

export function formatTimeForRaw(date: Date): string {
  return DateTime.fromJSDate(date).toFormat('h:mm a')
}

export function formatShowtimeRaw(date: Date): string {
  return `${formatDateForRaw(date)} ${formatTimeForRaw(date)}`
}
