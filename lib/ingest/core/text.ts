// lib/ingest/core/text.ts

export function normalizeWhitespace(input?: string | null): string {
  return (input || '').replace(/\s+/g, ' ').trim()
}

export function cleanText(input?: string | null): string {
  return normalizeWhitespace((input || '').replace(/\u00a0/g, ' '))
}

export function stripOuterQuotes(input?: string | null): string {
  return cleanText(input)
    .replace(/^["“”'‘’]+/, '')
    .replace(/["“”'‘’]+$/, '')
    .trim()
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

export function normalizeComparableText(input?: string | null): string {
  return cleanText(input).toLowerCase()
}

export function normalizeLooseComparableText(input?: string | null): string {
  return cleanText(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function getUniqueStrings(
  values: Array<string | undefined>,
  cleanValue: (value?: string | null) => string = cleanText,
  normalizeValue: (value: string) => string = normalizeComparableText
): string[] | undefined {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const cleaned = cleanValue(value)
    if (!cleaned) continue

    const normalized = normalizeValue(cleaned)
    if (seen.has(normalized)) continue

    seen.add(normalized)
    result.push(cleaned)
  }

  return result.length ? result : undefined
}

export function stripLeadingBullets(text?: string | null): string {
  return cleanText(text).replace(/^[·•●▪◦‣\.\s]+/u, '').trim()
}

export function cleanPossessivePrefixTitle(text?: string | null): string {
  let s = stripLeadingBullets(text)

  s = s
    .replace(/^Film Forum\s*(?:[·•:]\s*)?/i, '')
    .replace(/^Metrograph\s*(?:[·•:]\s*)?/i, '')
    .replace(/^The Young Film Forum\s*\(YFF\)\s*Archive Dive:\s*/i, '')
    .replace(/^\s*["'“”‘’]+/, '')
    .replace(/["'“”‘’]+\s*$/, '')
    .trim()

  const possessivePrefix =
    s.match(/^(.+?)(’s|'s|’|')\s+(.+)$/i)

  if (possessivePrefix) {
    const owner = normalizeWhitespace(possessivePrefix[1])
    const suffix = possessivePrefix[2]
    const rest = normalizeWhitespace(possessivePrefix[3])
    const isBareApostropheSuffix = suffix === '’' || suffix === "'"

    if (isBareApostropheSuffix && !/[sS]$/.test(owner)) {
      return s.trim()
    }

    if (
      owner.split(/\s+/).length <= 4 &&
      /[A-ZÀ-Ý]/.test(owner) &&
      !/[:/]/.test(owner) &&
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
