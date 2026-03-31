import { parse } from 'csv-parse/sync'

export type CsvProvider = 'douban' | 'letterboxd'

export type NormalizedImportMovieRow = {
  rowNumber: number
  source: CsvProvider
  title: string
  titleCandidates: string[]
  directorText?: string
  releaseYear?: number
  releaseDate?: Date
  watchedAt?: Date
  rating?: number | null
  reviewText?: string | null
  posterUrl?: string
  tmdbId?: number
  imdbId?: string
  doubanUrl?: string
  letterboxdUrl?: string
  productionCountriesText?: string
}

type NormalizedCsvRecord = Map<string, string>

function normalizeHeader(input: string) {
  return input.trim().replace(/^\ufeff/, '').toLowerCase().replace(/[\s_-]+/g, '')
}

function normalizeCell(input: unknown) {
  return typeof input === 'string' ? input.trim() : ''
}

function detectDelimiter(csvContent: string) {
  const firstLine = csvContent.split(/\r?\n/, 1)[0] || ''
  const tabCount = (firstLine.match(/\t/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length

  return tabCount > commaCount ? '\t' : ','
}

function parseCsvRecords(csvContent: string) {
  const delimiter = detectDelimiter(csvContent)
  const headerRow = parse(csvContent, {
    bom: true,
    columns: false,
    delimiter,
    relax_column_count: true,
    skip_empty_lines: true,
    to_line: 1,
    trim: true,
  }) as string[][]
  const rawRecords = parse(csvContent, {
    bom: true,
    columns: true,
    delimiter,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Array<Record<string, string>>

  const headers = (headerRow[0] || []).map(normalizeHeader)
  const records = rawRecords.map((record) => {
    const normalizedRecord = new Map<string, string>()

    Object.entries(record).forEach(([key, value]) => {
      normalizedRecord.set(normalizeHeader(key), normalizeCell(value))
    })

    return normalizedRecord
  })

  return {
    headers,
    records,
  }
}

function getRecordValue(record: NormalizedCsvRecord, aliases: string[]) {
  for (const alias of aliases.map(normalizeHeader)) {
    const value = record.get(alias)

    if (value) {
      return value
    }
  }

  return ''
}

function buildUtcNoonDate(year: number, month = 1, day = 1) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
}

function parseInteger(input?: string | null) {
  const trimmed = (input || '').trim()

  if (!trimmed) {
    return undefined
  }

  const parsed = Number.parseInt(trimmed, 10)
  return Number.isInteger(parsed) ? parsed : undefined
}

export function parseCsvHeaders(csvContent: string) {
  return parseCsvRecords(csvContent).headers
}

export function parseFlexibleDate(input?: string | null) {
  const trimmed = (input || '').trim()

  if (!trimmed) {
    return undefined
  }

  const fullDateMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)

  if (fullDateMatch) {
    const [, year, month, day] = fullDateMatch
    return buildUtcNoonDate(Number(year), Number(month), Number(day))
  }

  const yearMatch = trimmed.match(/^(\d{4})$/)

  if (yearMatch) {
    return buildUtcNoonDate(Number(yearMatch[1]), 1, 1)
  }

  const native = new Date(trimmed)

  if (!Number.isNaN(native.getTime())) {
    return native
  }

  return undefined
}

export function parseFlexibleRating(input?: string | null) {
  const trimmed = (input || '').trim()

  if (!trimmed) {
    return undefined
  }

  const parsed = Number.parseFloat(trimmed)

  if (Number.isNaN(parsed)) {
    return undefined
  }

  if (parsed < 0 || parsed > 5) {
    return undefined
  }

  if (!Number.isInteger(parsed * 2)) {
    return undefined
  }

  return parsed
}

export function splitTitleCandidates(rawTitle: string) {
  const parts = rawTitle
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)

  return [...new Set(parts.length > 0 ? parts : [rawTitle.trim()].filter(Boolean))]
}

export function detectCsvProvider(headers: string[]): CsvProvider | null {
  const headerSet = new Set(headers.map(normalizeHeader))

  if (headerSet.has('标题') || headerSet.has('条目链接')) {
    return 'douban'
  }

  if (
    headerSet.has('letterboxduri') ||
    headerSet.has('tmdbid') ||
    headerSet.has('watcheddate') ||
    headerSet.has('rating10')
  ) {
    return 'letterboxd'
  }

  return null
}

export function parseDoubanCsv(csvContent: string): NormalizedImportMovieRow[] {
  const { records } = parseCsvRecords(csvContent)

  return records
    .map((record, index) => {
      const rawTitle = getRecordValue(record, ['标题'])
      const titleCandidates = splitTitleCandidates(rawTitle)
      const releaseDate = parseFlexibleDate(getRecordValue(record, ['上映日期']))
      const watchedAt = parseFlexibleDate(getRecordValue(record, ['打分日期']))
      const rating = parseFlexibleRating(getRecordValue(record, ['个人评分']))
      const reviewText = getRecordValue(record, ['我的短评']) || undefined

      return {
        rowNumber: index + 2,
        source: 'douban' as const,
        title: titleCandidates[0] || rawTitle,
        titleCandidates,
        releaseYear: releaseDate?.getUTCFullYear(),
        releaseDate,
        watchedAt,
        rating,
        reviewText,
        posterUrl: getRecordValue(record, ['封面']) || undefined,
        doubanUrl: getRecordValue(record, ['条目链接']) || undefined,
        productionCountriesText: getRecordValue(record, ['制片国家']) || undefined,
      }
    })
    .filter((row) => row.title)
}

export function parseLetterboxdCsv(csvContent: string): NormalizedImportMovieRow[] {
  const { records } = parseCsvRecords(csvContent)

  return records
    .map((record, index) => {
      const title = getRecordValue(record, ['Title', 'Name'])
      const rating10 = parseInteger(getRecordValue(record, ['Rating10']))
      const rating =
        typeof rating10 === 'number'
          ? parseFlexibleRating(String(rating10 / 2))
          : parseFlexibleRating(getRecordValue(record, ['Rating']))

      return {
        rowNumber: index + 2,
        source: 'letterboxd' as const,
        title,
        titleCandidates: splitTitleCandidates(title),
        directorText: getRecordValue(record, ['Directors', 'Director']) || undefined,
        releaseYear: parseInteger(getRecordValue(record, ['Year'])),
        watchedAt: parseFlexibleDate(
          getRecordValue(record, ['WatchedDate', 'Watched Date', 'Date'])
        ),
        rating,
        reviewText: getRecordValue(record, ['Review', 'Review Text']) || undefined,
        tmdbId: parseInteger(getRecordValue(record, ['tmdbID', 'TMDB ID'])),
        imdbId: getRecordValue(record, ['imdbID', 'IMDb ID']) || undefined,
        letterboxdUrl:
          getRecordValue(record, ['LetterboxdURI', 'Letterboxd URL', 'URI', 'URL']) ||
          undefined,
      }
    })
    .filter((row) => row.title)
}
