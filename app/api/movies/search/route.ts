import { handlePublicSearchRoute } from '@/lib/api/search-route'
import type { MovieSearchResult } from '@/lib/movie/search-types'
import { searchLocalMovies } from '@/lib/movie/search-service'

export async function GET(request: Request) {
  return handlePublicSearchRoute({
    request,
    emptyResponse: [] as MovieSearchResult[],
    internalErrorMessage: 'Could not search movies right now.',
    logLabel: '[api][movies][search][GET]',
    run: async (query) => {
      const localResults = await searchLocalMovies(query)

      return localResults.map((movie) => ({
        id: movie.id,
        title: movie.title,
        year: movie.year,
        status: movie.status,
      }))
    },
  })
}
