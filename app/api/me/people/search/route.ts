import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import type {
  DirectorSearchResult,
  MeDirectorSearchResponse,
} from '@/lib/people/search-types'
import { searchLocalDirectors } from '@/lib/people/search-service'
import {
  searchTmdbDirectorCandidates,
  TmdbApiKeyMissingError,
  type TmdbDirectorCandidate,
} from '@/lib/people/resolve'

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
    const emptyResponse: MeDirectorSearchResponse = {
      localResults: [],
      externalResults: [],
    }

    return NextResponse.json(emptyResponse)
  }

  try {
    await requireUserId()

    const localResults: DirectorSearchResult[] = await searchLocalDirectors(query)
    let externalResults: TmdbDirectorCandidate[] = []

    try {
      const localTmdbIds = new Set(
        localResults
          .map((person) => person.tmdbId)
          .filter((tmdbId): tmdbId is number => typeof tmdbId === 'number')
      )

      externalResults = (await searchTmdbDirectorCandidates(query)).filter(
        (candidate) => !localTmdbIds.has(candidate.tmdbId)
      )
    } catch (error) {
      if (!(error instanceof TmdbApiKeyMissingError)) {
        throw error
      }
    }

    const response: MeDirectorSearchResponse = {
      localResults,
      externalResults,
    }

    return NextResponse.json(response)
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error)
    }

    console.error('[api][me][people][search][GET]', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Could not search directors right now.',
      },
      { status: 500 }
    )
  }
}
