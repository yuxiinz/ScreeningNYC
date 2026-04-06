import {
  handleAuthenticatedSearchRoute,
  searchExternalResults,
} from '@/lib/api/search-route'
import type {
  DirectorSearchResult,
  MeDirectorSearchResponse,
} from '@/lib/people/search-types'
import { searchLocalDirectors } from '@/lib/people/search-service'
import {
  searchTmdbDirectorCandidates,
} from '@/lib/people/resolve'

export async function GET(request: Request) {
  const emptyResponse: MeDirectorSearchResponse = {
    localResults: [],
    externalResults: [],
  }

  return handleAuthenticatedSearchRoute({
    request,
    emptyResponse,
    internalErrorMessage: 'Could not search directors right now.',
    logLabel: '[api][me][people][search][GET]',
    run: async (query) => {
      const localResults: DirectorSearchResult[] =
        await searchLocalDirectors(query)

      const externalResults = await searchExternalResults({
        query,
        localResults,
        getLocalTmdbId: (person) => person.tmdbId,
        searchExternal: searchTmdbDirectorCandidates,
        getExternalTmdbId: (candidate) => candidate.tmdbId,
      })

      return {
        localResults,
        externalResults,
      }
    },
  })
}
