import { parseFormat } from './meta'
import { cleanText } from './text'

type ExtractedTitleYear = {
  text: string
  releaseYear?: number
}

type ExtractedTitleFormat = {
  text: string
  rawFormat?: string
}

type ExtractedBracketedDescriptor = {
  text: string
  rawFormat?: string
  descriptor?: string
}

type SplitCuratorialSuffix = {
  title: string
  note?: string
  tmdbTitleCandidates?: string[]
}

export type ParsedScreeningTitle = {
  title: string
  releaseYear?: number
  rawFormat?: string
  showtimeNote?: string
  tmdbTitleCandidates?: string[]
  preferMovieTitleForDisplay?: boolean
}

const BRACKET_NOTE_PATTERNS = [
  /\bearly access\b/i,
  /\bpreview\b/i,
  /\bencore\b/i,
  /\bq&a\b/i,
  /\bin person\b/i,
  /\bwith\b/i,
  /\bopen captions?\b/i,
  /\bcaptioned\b/i,
  /\bintro(?:duced|duction)?\b/i,
  /\bdiscussion\b/i,
  /\bspecial screening\b/i,
  /\bmember(?:s)?\b/i,
]

const STRONG_CURATORIAL_PATTERNS = [
  /\bclassics?\b/i,
  /\bwith\b.+\bin person\b/i,
  /\bin person\b/i,
  /\bq&a\b/i,
  /\bintroduced by\b/i,
  /\bpost-screening\b/i,
  /\bearly access\b/i,
  /\bopen captions?\b/i,
  /\bcaptioned\b/i,
  /\bsing-?along\b/i,
  /\bretrospective\b/i,
  /\bseries\b/i,
  /\bspecial event\b/i,
  /\bhong kong cinema\b/i,
]

const WEAK_CURATORIAL_PATTERNS = [
  /\bclassics?\b/i,
  /\bweek\b/i,
  /\bnight\b/i,
  /\bpresentation\b/i,
  /\bguest\b/i,
  /\bfestival\b/i,
]

const DISALLOWED_HYPHEN_SUFFIX_PATTERNS = [
  /^part\s+[ivx0-9]+$/i,
  /^chapter\s+\d+$/i,
  /^episode\s+\d+$/i,
  /^vol(?:ume)?\s+\d+$/i,
  /^act\s+[ivx0-9]+$/i,
]

const INLINE_FORMAT_PATTERN =
  /^(.*?)(?:\s+in\s+|\s+)(4K\s*DCP|DCP|35\s*MM|16\s*MM|70\s*MM|IMAX|DIGITAL|BLU[\s-]?RAY|SUPER[\s-]?8(?:MM)?)$/i

function uniqueValues(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const cleaned = cleanText(value)
    if (!cleaned) continue

    const normalized = cleaned.toLowerCase()
    if (seen.has(normalized)) continue

    seen.add(normalized)
    result.push(cleaned)
  }

  return result
}

function isLikelyBracketedNote(descriptor: string): boolean {
  return BRACKET_NOTE_PATTERNS.some((pattern) => pattern.test(descriptor))
}

function isDisallowedHyphenSuffix(suffix: string): boolean {
  return DISALLOWED_HYPHEN_SUFFIX_PATTERNS.some((pattern) => pattern.test(suffix))
}

function scoreCuratorialSuffix(prefix: string, suffix: string): number {
  let score = 0

  if (STRONG_CURATORIAL_PATTERNS.some((pattern) => pattern.test(suffix))) {
    score += 4
  }

  if (WEAK_CURATORIAL_PATTERNS.some((pattern) => pattern.test(suffix))) {
    score += 2
  }

  if (/^[A-Z0-9&'":,./ ]+$/.test(suffix) && suffix.split(/\s+/).length >= 2) {
    score += 1
  }

  const prefixWordCount = prefix.split(/\s+/).length
  if (prefixWordCount >= 1 && prefixWordCount <= 8) {
    score += 1
  }

  if (suffix.split(/\s+/).length <= 8) {
    score += 1
  }

  if (isDisallowedHyphenSuffix(suffix)) {
    score -= 5
  }

  return score
}

export function extractTrailingYear(value?: string | null): ExtractedTitleYear {
  const cleaned = cleanText(value)
  if (!cleaned) return { text: '' }

  const match = cleaned.match(/\s*\(((?:18|19|20)\d{2})\)\s*$/)
  if (!match || typeof match.index !== 'number') {
    return { text: cleaned }
  }

  return {
    text: cleanText(cleaned.slice(0, match.index)),
    releaseYear: Number(match[1]),
  }
}

export function extractInlineFormat(value?: string | null): ExtractedTitleFormat {
  const cleaned = cleanText(value)
  if (!cleaned) return { text: '' }

  const match = cleaned.match(INLINE_FORMAT_PATTERN)
  if (!match?.[1] || !match[2]) {
    return { text: cleaned }
  }

  const rawFormat = parseFormat(match[2])
  if (!rawFormat) {
    return { text: cleaned }
  }

  return {
    text: cleanText(match[1]),
    rawFormat,
  }
}

export function extractBracketedDescriptor(
  value?: string | null
): ExtractedBracketedDescriptor {
  const cleaned = cleanText(value)
  if (!cleaned) return { text: '' }

  const match = cleaned.match(/\s*(?:\(([^()]+)\)|\[([^[\]]+)\])\s*$/)
  if (!match || typeof match.index !== 'number') {
    return { text: cleaned }
  }

  const descriptor = cleanText(match[1] || match[2])
  if (!descriptor) {
    return { text: cleaned }
  }

  const rawFormat = parseFormat(descriptor)
  if (rawFormat) {
    return {
      text: cleanText(cleaned.slice(0, match.index)),
      rawFormat,
    }
  }

  if (!isLikelyBracketedNote(descriptor)) {
    return { text: cleaned }
  }

  return {
    text: cleanText(cleaned.slice(0, match.index)),
    descriptor,
  }
}

export function splitCuratorialSuffix(value?: string | null): SplitCuratorialSuffix {
  const cleaned = cleanText(value)
  if (!cleaned || !/\s+-\s+/.test(cleaned)) {
    return { title: cleaned }
  }

  const parts = cleaned.split(/\s+-\s+/)
  const suffix = cleanText(parts.pop())
  const prefix = cleanText(parts.join(' - '))

  if (!prefix || !suffix || isDisallowedHyphenSuffix(suffix)) {
    return { title: cleaned }
  }

  const score = scoreCuratorialSuffix(prefix, suffix)

  if (score >= 5) {
    return {
      title: prefix,
      note: suffix,
      tmdbTitleCandidates: uniqueValues([prefix, cleaned]),
    }
  }

  if (score >= 3) {
    return {
      title: cleaned,
      tmdbTitleCandidates: uniqueValues([cleaned, prefix]),
    }
  }

  return { title: cleaned }
}

export function mergeShowtimeNotes(
  ...values: Array<string | undefined>
): string | undefined {
  const notes = uniqueValues(values)
  return notes.length ? notes.join(' / ') : undefined
}

export function parseScreeningTitle(value?: string | null): ParsedScreeningTitle {
  const cleaned = cleanText(value)
  if (!cleaned) {
    return { title: '' }
  }

  let remaining = cleaned
  let releaseYear: number | undefined
  let rawFormat: string | undefined
  const bracketNotes: string[] = []

  for (let index = 0; index < 6; index += 1) {
    const yearExtraction = extractTrailingYear(remaining)
    if (!releaseYear && yearExtraction.releaseYear && yearExtraction.text !== remaining) {
      releaseYear = yearExtraction.releaseYear
      remaining = yearExtraction.text
      continue
    }

    const bracketExtraction = extractBracketedDescriptor(remaining)
    if (bracketExtraction.text !== remaining) {
      if (!rawFormat && bracketExtraction.rawFormat) {
        rawFormat = bracketExtraction.rawFormat
      }

      if (bracketExtraction.descriptor) {
        bracketNotes.unshift(bracketExtraction.descriptor)
      }

      remaining = bracketExtraction.text
      continue
    }

    const formatExtraction = extractInlineFormat(remaining)
    if (!rawFormat && formatExtraction.rawFormat && formatExtraction.text !== remaining) {
      rawFormat = formatExtraction.rawFormat
      remaining = formatExtraction.text
      continue
    }

    break
  }

  const suffixSplit = splitCuratorialSuffix(remaining)
  const title = cleanText(suffixSplit.title)

  return {
    title,
    releaseYear,
    rawFormat,
    showtimeNote: mergeShowtimeNotes(...bracketNotes, suffixSplit.note),
    tmdbTitleCandidates: suffixSplit.tmdbTitleCandidates,
    preferMovieTitleForDisplay: title !== cleaned,
  }
}

export function normalizeScreeningMovieTitle(value?: string | null): string {
  const cleaned = cleanText(value)
  if (!cleaned) return ''

  const parsed = parseScreeningTitle(cleaned)
  return cleanText(parsed.title) || cleaned
}
