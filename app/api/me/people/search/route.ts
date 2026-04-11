import { createSearchRoute } from '@/lib/api/search-route'
import { requireUserId } from '@/lib/auth/require-user-id'
import type { MeDirectorSearchExternalResult } from '@/lib/people/search-types'
import { searchLocalDirectors } from '@/lib/people/search-service'
import { searchTmdbDirectorCandidates } from '@/lib/people/resolve'

export const GET = createSearchRoute({
  getUserId: requireUserId,
  external: {
    getExternalTmdbId: (candidate: MeDirectorSearchExternalResult) => candidate.tmdbId,
    getLocalTmdbId: (person) => person.tmdbId,
    searchExternal: searchTmdbDirectorCandidates,
  },
  internalErrorMessage: 'Could not search directors right now.',
  logLabel: '[api][me][people][search][GET]',
  searchLocal: searchLocalDirectors,
})
