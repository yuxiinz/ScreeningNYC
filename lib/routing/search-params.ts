export function getFirstSearchParamValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

export const MIN_HOME_GRID_COLUMNS = 1
export const MAX_HOME_GRID_COLUMNS = 6
export const DEFAULT_HOME_GRID_COLUMNS = 6
export const HOME_GRID_ROWS_PER_PAGE = 8

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

export function parseHomeGridColumns(
  rawCols?: string | string[],
  fallback = DEFAULT_HOME_GRID_COLUMNS
) {
  const cols = Number.parseInt(
    getFirstSearchParamValue(rawCols) || String(fallback),
    10
  )

  if (!Number.isFinite(cols)) {
    return fallback
  }

  return Math.min(
    MAX_HOME_GRID_COLUMNS,
    Math.max(MIN_HOME_GRID_COLUMNS, cols)
  )
}
