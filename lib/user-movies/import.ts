import { MovieIdentityConflictError } from '@/lib/ingest/services/persist-service'
import { resolveMovieFromImportInput } from '@/lib/movie/resolve'
import {
  detectCsvProvider,
  parseCsvHeaders,
  parseDoubanCsv,
  parseLetterboxdCsv,
  type CsvProvider,
} from '@/lib/user-movies/import-parser'
import { addWant, markWatched } from '@/lib/user-movies/service'

export type ImportListType = 'want' | 'watched'
export type { CsvProvider, NormalizedImportMovieRow } from '@/lib/user-movies/import-parser'

export type MovieImportSummaryItem = {
  rowNumber: number
  status: 'imported' | 'already_present' | 'failed'
  title: string
  matchedVia?: string
  message?: string
}

export type MovieImportSummary = {
  provider: CsvProvider
  totalRows: number
  importedCount: number
  alreadyPresentCount: number
  failedCount: number
  items: MovieImportSummaryItem[]
}

export async function importMoviesForUser(
  userId: string,
  input: {
    listType: ImportListType
    csvContent: string
  }
): Promise<MovieImportSummary> {
  const provider = detectCsvProvider(parseCsvHeaders(input.csvContent))

  if (!provider) {
    throw new Error('Unsupported CSV columns. Expected a Douban or Letterboxd export.')
  }

  const rows =
    provider === 'douban'
      ? parseDoubanCsv(input.csvContent)
      : parseLetterboxdCsv(input.csvContent)

  const items: MovieImportSummaryItem[] = []
  let importedCount = 0
  let alreadyPresentCount = 0
  let failedCount = 0

  for (const row of rows) {
    try {
      const resolved = await resolveMovieFromImportInput({
        title: row.title,
        titleCandidates: row.titleCandidates,
        directorText: row.directorText,
        releaseYear: row.releaseYear,
        releaseDate: row.releaseDate,
        posterUrl: row.posterUrl,
        tmdbId: row.tmdbId,
        imdbId: row.imdbId,
        doubanUrl: row.doubanUrl,
        letterboxdUrl: row.letterboxdUrl,
        productionCountriesText: row.productionCountriesText,
      })

      if (!resolved.movie) {
        failedCount += 1
        items.push({
          rowNumber: row.rowNumber,
          status: 'failed',
          title: row.title,
          message: 'Could not confidently match this film.',
        })
        continue
      }

      if (input.listType === 'want') {
        const result = await addWant(userId, resolved.movie.id)

        if (result.alreadyExisted) {
          alreadyPresentCount += 1
          items.push({
            rowNumber: row.rowNumber,
            status: 'already_present',
            title: row.title,
            matchedVia: resolved.matchedVia,
            message: 'Already in want list.',
          })
        } else {
          importedCount += 1
          items.push({
            rowNumber: row.rowNumber,
            status: 'imported',
            title: row.title,
            matchedVia: resolved.matchedVia,
          })
        }

        continue
      }

      const result = await markWatched(userId, resolved.movie.id, {
        confirmRemoveWant: true,
        watchedAt: row.watchedAt,
        rating: row.rating,
        reviewText: row.reviewText,
      })

      if (result.alreadyExisted) {
        alreadyPresentCount += 1
        items.push({
          rowNumber: row.rowNumber,
          status: 'already_present',
          title: row.title,
          matchedVia: resolved.matchedVia,
          message: 'Updated existing watched entry.',
        })
      } else {
        importedCount += 1
        items.push({
          rowNumber: row.rowNumber,
          status: 'imported',
          title: row.title,
          matchedVia: resolved.matchedVia,
        })
      }
    } catch (error) {
      failedCount += 1

      items.push({
        rowNumber: row.rowNumber,
        status: 'failed',
        title: row.title,
        message:
          error instanceof MovieIdentityConflictError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Import failed for this row.',
      })
    }
  }

  return {
    provider,
    totalRows: rows.length,
    importedCount,
    alreadyPresentCount,
    failedCount,
    items,
  }
}
