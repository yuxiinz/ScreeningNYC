// lib/ingest/core/url.ts

export function buildAbsoluteUrl(
  baseUrl: string,
  maybeRelative?: string | null
): string | undefined {
  if (!maybeRelative) return undefined

  try {
    return new URL(maybeRelative, baseUrl).toString()
  } catch {
    return undefined
  }
}

export function pickFirstAbsoluteUrl(
  baseUrl: string,
  candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    const abs = buildAbsoluteUrl(baseUrl, candidate)
    if (abs) return abs
  }

  return undefined
}