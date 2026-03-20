// lib/ingest/adapters/shared.ts

import axios from 'axios'

export function normalizeWhitespace(input?: string | null): string {
  return (input || '').replace(/\s+/g, ' ').trim()
}

export function buildAbsoluteUrl(
  baseUrl: string,
  maybeRelative?: string
): string | undefined {
  if (!maybeRelative) return undefined

  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return undefined
  }
}

export async function fetchHtml(url: string): Promise<string> {
  const res = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  })

  return res.data
}

export function parseMetaLine(metaText: string): {
  year?: number
  runtimeMinutes?: number
  format?: string
} {
  const cleaned = normalizeWhitespace(metaText)
  if (!cleaned) return {}

  const parts = cleaned.split('/').map((s) => normalizeWhitespace(s))

  let year: number | undefined
  let runtimeMinutes: number | undefined
  let format: string | undefined

  for (const part of parts) {
    if (!year) {
      const yearMatch = part.match(/\b(18|19|20)\d{2}\b/)
      if (yearMatch) year = Number(yearMatch[0])
    }

    if (!runtimeMinutes) {
      const runtimeMatch = part.match(/(\d+)\s*min/i)
      if (runtimeMatch) runtimeMinutes = Number(runtimeMatch[1])
    }

    if (!format) {
      const fmtMatch = part.match(/(4K DCP|DCP|35MM|70MM|IMAX|DIGITAL|STANDARD)/i)
      if (fmtMatch) format = fmtMatch[0].toUpperCase()
    }
  }

  if (!format && parts.length >= 3 && parts[2].length < 20) {
    format = parts[2]
  }

  return { year, runtimeMinutes, format }
}

export function stripLeadingBullets(text: string): string {
  return normalizeWhitespace(text).replace(/^[·•●▪◦‣\.\s]+/u, '').trim()
}

export function cleanPossessivePrefixTitle(text: string): string {
  let s = stripLeadingBullets(text)

  s = s
    .replace(/^Film Forum\s*:?\s*/i, '')
    .replace(/^Metrograph\s*:?\s*/i, '')
    .replace(/^The Young Film Forum\s*\(YFF\)\s*Archive Dive:\s*/i, '')
    .replace(/^\s*["'“”‘’]+/, '')
    .replace(/["'“”‘’]+\s*$/, '')
    .trim()

  const possessivePrefix =
    s.match(/^(.+?)’s\s+(.+)$/i) ||
    s.match(/^(.+?)'s\s+(.+)$/i)

  if (possessivePrefix) {
    const owner = normalizeWhitespace(possessivePrefix[1])
    const rest = normalizeWhitespace(possessivePrefix[2])

    if (
      owner.split(/\s+/).length <= 4 &&
      /[A-ZÀ-Ý]/.test(owner) &&
      !/^(today|tomorrow|members|film forum|metrograph)$/i.test(owner)
    ) {
      s = rest
    }
  }

  s = s
    .replace(/\s*:\s*YFF ARCHIVE DIVE$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return s
}

export function isLikelyProgramTitle(title?: string): boolean {
  const s = normalizeWhitespace(title).toLowerCase()
  if (!s) return false

  return [
    'presented by',
    'retrospective',
    'comprehensive retrospective',
    'archive dive',
    'program',
    'series',
    'q&a',
    'conversation',
    'double feature',
    'shorts',
    'festival',
    'tribute',
  ].some((kw) => s.includes(kw))
}

export function isTmdbImage(url?: string | null): boolean {
  return !!url && /image\.tmdb\.org/i.test(url)
}