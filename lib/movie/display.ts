export function getReleaseYear(date?: Date | null): number | null {
  if (!date) return null
  return new Date(date).getUTCFullYear()
}

export function isTmdbPoster(url?: string | null): boolean {
  return !!url && url.includes('image.tmdb.org')
}

export function cleanDirectorText(
  input?: string | null,
  fallback = 'Unknown'
): string {
  const text = (input || '').replace(/\s+/g, ' ').trim()
  if (!text) return fallback

  const withoutDirectedBy = text.replace(/^directed by\s*/i, '').trim()

  const stopPatterns = [
    /\b(18|19|20)\d{2}\b/,
    /\b\d+\s*min\b/i,
    /\b(4k dcp|dcp|35mm|70mm|imax|digital)\b/i,
    /\bthe first\b/i,
    /\bwinner\b/i,
    /\bpresented\b/i,
    /\bproduced by\b/i,
  ]

  let cutIndex = withoutDirectedBy.length

  for (const pattern of stopPatterns) {
    const match = withoutDirectedBy.match(pattern)
    if (match && typeof match.index === 'number') {
      cutIndex = Math.min(cutIndex, match.index)
    }
  }

  const cleaned = withoutDirectedBy.slice(0, cutIndex).trim()
  return cleaned || fallback
}
