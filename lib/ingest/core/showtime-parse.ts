import { DateTime } from 'luxon'
import { APP_TIMEZONE } from '../../timezone'
import { normalizeWhitespace } from './text'

export function normalizeFormat(raw?: string | null): string {
  const s = normalizeWhitespace(raw).toLowerCase()

  if (!s) return 'Standard'
  if (s.includes('70mm')) return '70mm'
  if (s.includes('35mm')) return '35mm'
  if (s.includes('16mm')) return '16mm'
  if (s.includes('super-8') || s.includes('super 8')) return 'Super 8'
  if (s.includes('imax')) return 'IMAX'
  if (s.includes('3d')) return '3D'
  if (s.includes('dolby')) return 'Dolby'
  if (s.includes('digital')) return 'Digital'
  if (s.includes('4k dcp')) return '4K DCP'
  if (s.includes('dcp')) return 'DCP'

  return 'Standard'
}

export function parseStartTime(raw: string): Date | null {
  const cleaned = normalizeWhitespace(raw)
  if (!cleaned) return null

  const now = DateTime.now().setZone(APP_TIMEZONE)
  const hasExplicitYear = /\b(18|19|20)\d{2}\b/.test(cleaned)

  const withoutWeekday = cleaned
    .replace(
      /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+/i,
      ''
    )
    .trim()

  const hasAmPm = /\b(am|pm)\b/i.test(cleaned)
  const hasClockTime = /\d{1,2}:\d{2}/.test(cleaned)

  const candidates = new Set<string>()

  candidates.add(cleaned)
  candidates.add(withoutWeekday)

  if (!hasExplicitYear) {
    candidates.add(`${cleaned} ${now.year}`)
    candidates.add(`${withoutWeekday} ${now.year}`)

    const monthDayTimeMatch = withoutWeekday.match(
      /^([A-Za-z]+\.?\s+\d{1,2})(?:,\s*)?\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)$/i
    )

    if (monthDayTimeMatch) {
      candidates.add(`${monthDayTimeMatch[1]} ${now.year} ${monthDayTimeMatch[2]}`)
      candidates.add(`${monthDayTimeMatch[1]} ${monthDayTimeMatch[2]} ${now.year}`)
    }

    const numericDateTimeMatch = withoutWeekday.match(
      /^(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)$/i
    )

    if (numericDateTimeMatch) {
      candidates.add(`${numericDateTimeMatch[1]}/${now.year} ${numericDateTimeMatch[2]}`)
      candidates.add(`${numericDateTimeMatch[1]} ${now.year} ${numericDateTimeMatch[2]}`)
    }

    const dateOnlyMatch = withoutWeekday.match(/^([A-Za-z]+\.?\s+\d{1,2})$/i)
    if (dateOnlyMatch) {
      candidates.add(`${dateOnlyMatch[1]} ${now.year}`)
    }
  }

  const formats = [
    'EEEE MMMM d yyyy h:mma',
    'EEEE MMM d yyyy h:mma',
    'EEE MMMM d yyyy h:mma',
    'EEE MMM d yyyy h:mma',

    'EEEE MMMM d yyyy h:mm a',
    'EEEE MMM d yyyy h:mm a',
    'EEE MMMM d yyyy h:mm a',
    'EEE MMM d yyyy h:mm a',

    'EEEE MMMM d h:mma yyyy',
    'EEEE MMM d h:mma yyyy',
    'EEE MMMM d h:mma yyyy',
    'EEE MMM d h:mma yyyy',

    'EEEE MMMM d h:mm a yyyy',
    'EEEE MMM d h:mm a yyyy',
    'EEE MMMM d h:mm a yyyy',
    'EEE MMM d h:mm a yyyy',

    'MMMM d yyyy h:mma',
    'MMMM d yyyy h:mm a',
    'MMMM d yyyy h:mm',
    'MMMM d yyyy H:mm',

    'MMM d yyyy h:mma',
    'MMM d yyyy h:mm a',
    'MMM d yyyy h:mm',
    'MMM d yyyy H:mm',

    'LLLL d yyyy h:mma',
    'LLLL d yyyy h:mm a',
    'LLLL d yyyy h:mm',
    'LLLL d yyyy H:mm',

    'LLL d yyyy h:mma',
    'LLL d yyyy h:mm a',
    'LLL d yyyy h:mm',
    'LLL d yyyy H:mm',

    'MMMM d h:mma yyyy',
    'MMMM d h:mm a yyyy',
    'MMM d h:mma yyyy',
    'MMM d h:mm a yyyy',
    'LLLL d h:mma yyyy',
    'LLLL d h:mm a yyyy',
    'LLL d h:mma yyyy',
    'LLL d h:mm a yyyy',

    'yyyy-MM-dd h:mma',
    'yyyy-MM-dd h:mm a',
    'yyyy-MM-dd h:mm',
    'yyyy-MM-dd H:mm',

    'M/d/yyyy h:mma',
    'M/d/yyyy h:mm a',
    'M/d/yyyy h:mm',
    'M/d/yyyy H:mm',

    'M/d/yy h:mma',
    'M/d/yy h:mm a',
    'M/d/yy h:mm',
    'M/d/yy H:mm',

    'MMMM d yyyy',
    'MMM d yyyy',
    'LLLL d yyyy',
    'LLL d yyyy',
    'yyyy-MM-dd',
    'M/d/yyyy',
    'M/d/yy',
  ]

  for (const candidate of candidates) {
    for (const fmt of formats) {
      const dt = DateTime.fromFormat(candidate, fmt, { zone: APP_TIMEZONE })

      if (dt.isValid) {
        let finalDt = dt

        if (!hasClockTime && finalDt.hour === 0 && finalDt.minute === 0) {
          finalDt = finalDt.set({ hour: 12, minute: 0 })
        }

        if (!hasAmPm && /\d{1,2}:\d{2}/.test(candidate) && finalDt.hour >= 1 && finalDt.hour <= 10) {
          finalDt = finalDt.plus({ hours: 12 })
        }

        if (!hasExplicitYear && finalDt < now.minus({ months: 2 })) {
          finalDt = finalDt.plus({ years: 1 })
        }

        return finalDt.toUTC().toJSDate()
      }
    }
  }

  const iso = DateTime.fromISO(cleaned, { zone: APP_TIMEZONE })
  if (iso.isValid) return iso.toUTC().toJSDate()

  const native = new Date(cleaned)
  if (!isNaN(native.getTime())) {
    let dt = DateTime.fromJSDate(native).setZone(APP_TIMEZONE, { keepLocalTime: true })

    if (!hasAmPm && dt.hour >= 1 && dt.hour <= 10) {
      dt = dt.plus({ hours: 12 })
    }

    if (!hasExplicitYear && dt < now.minus({ months: 2 })) {
      dt = dt.plus({ years: 1 })
    }

    return dt.toUTC().toJSDate()
  }

  return null
}
