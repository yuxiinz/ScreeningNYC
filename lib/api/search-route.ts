import { NextResponse } from 'next/server'

import {
  getEmptyClientEntitySearchResults,
  type ClientEntitySearchResults,
} from '@/lib/api/client-search'
import {
  buildUnauthorizedResponse,
  jsonError,
} from '@/lib/api/route'
import { AuthRequiredError } from '@/lib/auth/require-user-id'
import { TmdbApiKeyMissingError } from '@/lib/tmdb/client'

type SearchRouteExternalConfig<TLocal, TExternal> = {
  getExternalTmdbId: (item: TExternal) => number
  getLocalTmdbId: (item: TLocal) => number | null | undefined
  searchExternal: (query: string) => Promise<TExternal[]>
}

type SearchRouteConfig<TLocalSearch, TLocalResult = TLocalSearch, TExternal = never> = {
  external?: SearchRouteExternalConfig<TLocalSearch, TExternal>
  getUserId?: () => Promise<string>
  internalErrorMessage: string
  logLabel: string
  mapLocalResults?: (
    localResults: TLocalSearch[],
    userId: string
  ) => Promise<TLocalResult[]> | TLocalResult[]
  minQueryLength?: number
  searchLocal: (query: string) => Promise<TLocalSearch[]>
}

type ExternalSearchRequest<TLocal, TExternal> = {
  external: SearchRouteExternalConfig<TLocal, TExternal>
  localResults: TLocal[]
  query: string
}

function getSearchQuery(request: Request) {
  return new URL(request.url).searchParams.get('q')?.trim() || ''
}

export function createSearchRoute<
  TLocalSearch,
  TLocalResult = TLocalSearch,
  TExternal = never,
>({
  external,
  getUserId,
  internalErrorMessage,
  logLabel,
  mapLocalResults,
  minQueryLength = 2,
  searchLocal,
}: SearchRouteConfig<TLocalSearch, TLocalResult, TExternal>) {
  return async (request: Request) => {
    const query = getSearchQuery(request)

    if (query.length < minQueryLength) {
      return NextResponse.json(
        external
          ? getEmptyClientEntitySearchResults<TLocalResult, TExternal>()
          : ([] as TLocalResult[])
      )
    }

    try {
      const userId = getUserId ? await getUserId() : ''
      const localSearchResults = await searchLocal(query)
      const localResults = mapLocalResults
        ? await mapLocalResults(localSearchResults, userId)
        : (localSearchResults as unknown as TLocalResult[])

      if (!external) {
        return NextResponse.json(localResults)
      }

      const externalResults = await searchExternalResults({
        external,
        query,
        localResults: localSearchResults,
      })

      return NextResponse.json({
        localResults,
        externalResults,
      } satisfies ClientEntitySearchResults<TLocalResult, TExternal>)
    } catch (error) {
      if (getUserId && error instanceof AuthRequiredError) {
        return buildUnauthorizedResponse(error.message)
      }

      console.error(logLabel, error)

      return jsonError('INTERNAL_ERROR', internalErrorMessage, 500)
    }
  }
}

export async function searchExternalResults<TLocal, TExternal>({
  external,
  localResults,
  query,
}: ExternalSearchRequest<TLocal, TExternal>): Promise<TExternal[]> {
  const { getExternalTmdbId, getLocalTmdbId, searchExternal } = external

  const localTmdbIds = new Set(
    localResults
      .map(getLocalTmdbId)
      .filter((tmdbId): tmdbId is number => typeof tmdbId === 'number')
  )

  try {
    return (await searchExternal(query)).filter(
      (candidate) => !localTmdbIds.has(getExternalTmdbId(candidate))
    )
  } catch (error) {
    if (error instanceof TmdbApiKeyMissingError) {
      return []
    }

    throw error
  }
}
