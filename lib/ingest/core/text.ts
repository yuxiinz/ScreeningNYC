// lib/ingest/core/text.ts

export function normalizeWhitespace(input?: string | null): string {
  return (input || '').replace(/\s+/g, ' ').trim()
}

export function cleanText(input?: string | null): string {
  return normalizeWhitespace((input || '').replace(/\u00a0/g, ' '))
}

export function decodeHtmlEntities(text?: string | null): string {
  const input = text || ''

  return input
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&quot;/g, '"')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&#8230;/g, '…')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”')
    .replace(/&ldquo;/g, '“')
}

export function stripLeadingBullets(text?: string | null): string {
  return cleanText(text).replace(/^[·•●▪◦‣\.\s]+/u, '').trim()
}

export function cleanPossessivePrefixTitle(text?: string | null): string {
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

  return s.trim()
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