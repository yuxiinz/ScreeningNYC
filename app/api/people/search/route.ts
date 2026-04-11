import { createSearchRoute } from '@/lib/api/search-route'
import { searchLocalDirectors } from '@/lib/people/search-service'

export const GET = createSearchRoute({
  internalErrorMessage: 'Could not search directors right now.',
  logLabel: '[api][people][search][GET]',
  searchLocal: searchLocalDirectors,
})
