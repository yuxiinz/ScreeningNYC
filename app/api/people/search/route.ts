import { handlePublicSearchRoute } from '@/lib/api/search-route'
import type { DirectorSearchResult } from '@/lib/people/search-types'
import { searchLocalDirectors } from '@/lib/people/search-service'

export async function GET(request: Request) {
  return handlePublicSearchRoute({
    request,
    emptyResponse: [] as DirectorSearchResult[],
    internalErrorMessage: 'Could not search directors right now.',
    logLabel: '[api][people][search][GET]',
    run: searchLocalDirectors,
  })
}
