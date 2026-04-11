import { normalizeComparableText } from './text'

const TITLE_PROGRAM_PATTERNS = [
  /\btribute\b/i,
  /\bprogram\b/i,
  /\bshorts\b/i,
  /\bdouble feature\b/i,
  /\bepisodes\b/i,
  /\bpanel\b/i,
  /\bsecret screening\b/i,
  /\bmembers only\b/i,
  /\baward-winning shorts\b/i,
  /\bpresents\b/i,
]

const OVERVIEW_PROGRAM_PATTERNS = [
  /\bprogram of shorts\b/i,
  /\bshort film program\b/i,
  /\bpresents a program\b/i,
  /\bas part of\b/i,
  /\bpart of (?:the )?.+?\b(?:festival|retrospective|series)\b/i,
  /\bthis (?:festival|retrospective|series)\b/i,
]

export function isProgramContent(input: {
  title?: string
  overview?: string
}): boolean {
  const title = normalizeComparableText(input.title)
  const overview = normalizeComparableText(input.overview)

  return (
    TITLE_PROGRAM_PATTERNS.some((pattern) => pattern.test(title)) ||
    OVERVIEW_PROGRAM_PATTERNS.some((pattern) => pattern.test(overview)) ||
    overview.includes('special thanks to')
  )
}
