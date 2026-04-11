import { createSearchRoute } from '@/lib/api/search-route'
import { searchLocalMovies } from '@/lib/movie/search-service'

export const GET = createSearchRoute({
  internalErrorMessage: 'Could not search movies right now.',
  logLabel: '[api][movies][search][GET]',
  mapLocalResults: (localResults) =>
    localResults.map((movie) => ({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      status: movie.status,
    })),
  searchLocal: searchLocalMovies,
})
