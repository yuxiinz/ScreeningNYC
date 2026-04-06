export function getFirstSearchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

export function parseTheaterSlugs(value?: string | string[]) {
  const rawValues = Array.isArray(value) ? value : value ? [value] : []

  return rawValues
    .flatMap((item) => item.split(','))
    .map((slug) => slug.trim())
    .filter(Boolean)
}

export function parsePositivePage(
  rawPage?: string | string[],
  fallback = 1
) {
  const page = Number.parseInt(
    getFirstSearchParamValue(rawPage) || String(fallback),
    10
  )

  if (!Number.isFinite(page) || page < 1) {
    return fallback
  }

  return page
}
