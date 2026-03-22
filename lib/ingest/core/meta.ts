// lib/ingest/core/meta.ts

import { normalizeWhitespace } from './text'

export type ParsedBasicMeta = {
  year?: number
  runtimeMinutes?: number
  format?: string
}

export type ParsedCommaMeta = ParsedBasicMeta & {
  country?: string
  rawParts: string[]
}

const FORMAT_PATTERNS: Array<{
  pattern: RegExp
  normalized: string
}> = [
  { pattern: /4K\s*DCP/i, normalized: '4K DCP' },
  { pattern: /\bDCP\b/i, normalized: 'DCP' },
  { pattern: /35\s*MM/i, normalized: '35mm' },
  { pattern: /16\s*MM/i, normalized: '16mm' },
  { pattern: /70\s*MM/i, normalized: '70mm' },
  { pattern: /\bIMAX\b/i, normalized: 'IMAX' },
  { pattern: /\bDIGITAL\b/i, normalized: 'Digital' },
  { pattern: /\bBLU[\s-]?RAY\b/i, normalized: 'Blu-ray' },
  { pattern: /\bSTANDARD\b/i, normalized: 'Standard' },
]

export function parseYear(value?: string | null): number | undefined {
  if (!value) return undefined

  const cleaned = normalizeWhitespace(value)
  const match = cleaned.match(/\b(18|19|20)\d{2}\b/)

  return match ? Number(match[0]) : undefined
}

export function parseRuntimeMinutes(value?: string | null): number | undefined {
  if (!value) return undefined

  const cleaned = normalizeWhitespace(value)

  const minuteMatch =
    cleaned.match(/(\d+)\s*minutes?\b/i) ||
    cleaned.match(/(\d+)\s*mins?\b/i) ||
    cleaned.match(/(\d+)\s*min\.?\b/i) ||
    cleaned.match(/^\s*(\d+)\s*m\s*$/i)

  return minuteMatch ? Number(minuteMatch[1]) : undefined
}

export function parseFormat(value?: string | null): string | undefined {
  if (!value) return undefined

  const cleaned = normalizeWhitespace(value)

  for (const entry of FORMAT_PATTERNS) {
    if (entry.pattern.test(cleaned)) {
      return entry.normalized
    }
  }

  return undefined
}

export function parseSlashSeparatedMeta(metaText?: string | null): ParsedBasicMeta {
  const cleaned = normalizeWhitespace(metaText)
  if (!cleaned) return {}

  const parts = cleaned.split('/').map((s) => normalizeWhitespace(s)).filter(Boolean)

  let year: number | undefined
  let runtimeMinutes: number | undefined
  let format: string | undefined

  for (const part of parts) {
    if (!year) {
      year = parseYear(part)
    }

    if (!runtimeMinutes) {
      runtimeMinutes = parseRuntimeMinutes(part)
    }

    if (!format) {
      format = parseFormat(part)
    }
  }

  if (!format && parts.length >= 3 && parts[2].length < 24) {
    format = parts[2]
  }

  return { year, runtimeMinutes, format }
}

export function parseCommaSeparatedMeta(metaText?: string | null): ParsedCommaMeta {
  const cleaned = normalizeWhitespace(metaText)
  if (!cleaned) {
    return { rawParts: [] }
  }

  const parts = cleaned
    .split(',')
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean)

  let year: number | undefined
  let runtimeMinutes: number | undefined
  let format: string | undefined
  let country: string | undefined

  for (const part of parts) {
    if (!year) {
      year = parseYear(part)
    }

    if (!runtimeMinutes) {
      runtimeMinutes = parseRuntimeMinutes(part)
    }

    if (!format) {
      format = parseFormat(part)
    }
  }

  const countryCandidate = [...parts].reverse().find((part) => {
    return !parseYear(part) && !parseRuntimeMinutes(part) && !parseFormat(part)
  })

  if (countryCandidate) {
    country = countryCandidate
  }

  return {
    year,
    runtimeMinutes,
    format,
    country,
    rawParts: parts,
  }
}

export function parseMetaLine(metaText?: string | null): ParsedBasicMeta {
  return parseSlashSeparatedMeta(metaText)
}