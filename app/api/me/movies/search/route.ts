import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import type { MeMovieSearchLocalResult, MeMovieSearchResponse } from '@/lib/movie/search'
import { searchLocalMovies } from '@/lib/movie/search-service'
import {
  searchTmdbCandidates,
  TmdbApiKeyMissingError,
  type TmdbCandidate,
} from '@/lib/movie/resolve'
import { getMovieStatesForUser } from '@/lib/user-movies/service'

function buildUnauthorizedResponse(error: AuthRequiredError) {
  return NextResponse.json(
    {
      code: 'UNAUTHORIZED',
      message: error.message,
    },
    { status: 401 }
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim() || ''

  if (query.length < 2) {
    const emptyResponse: MeMovieSearchResponse = {
      localResults: [],
      externalResults: [],
    }

    return NextResponse.json(emptyResponse)
  }

  try {
    const userId = await requireUserId()
    const localSearchResults = await searchLocalMovies(query)
    const movieStates = await getMovieStatesForUser(
      userId,
      localSearchResults.map((movie) => movie.id)
    )

    const localResults: MeMovieSearchLocalResult[] = localSearchResults.map((movie) => {
      const movieState = movieStates.get(movie.id) || {
        inWant: false,
        inWatched: false,
      }

      return {
        id: movie.id,
        title: movie.title,
        year: movie.year,
        status: movie.status,
        inWant: movieState.inWant,
        inWatched: movieState.inWatched,
      }
    })

    let externalResults: TmdbCandidate[] = []

    try {
      const localTmdbIds = new Set(
        localSearchResults
          .map((movie) => movie.tmdbId)
          .filter((tmdbId): tmdbId is number => typeof tmdbId === 'number')
      )

      externalResults = (await searchTmdbCandidates(query)).filter(
        (candidate) => !localTmdbIds.has(candidate.tmdbId)
      )
    } catch (error) {
      if (!(error instanceof TmdbApiKeyMissingError)) {
        throw error
      }
    }

    const response: MeMovieSearchResponse = {
      localResults,
      externalResults,
    }

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error)
    }

    console.error('[api][me][movies][search][GET]', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Could not search movies right now.',
      },
      { status: 500 }
    )
  }
}
