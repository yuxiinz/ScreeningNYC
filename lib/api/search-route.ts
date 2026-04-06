import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import { TmdbApiKeyMissingError } from '@/lib/tmdb/client'

type SearchRouteConfig<TResponse> = {
  emptyResponse: TResponse
  internalErrorMessage: string
  logLabel: string
  minQueryLength?: number
  request: Request
  run: (query: string) => Promise<TResponse>
}

type AuthenticatedSearchRouteConfig<TResponse> = {
  emptyResponse: TResponse
  internalErrorMessage: string
  logLabel: string
  minQueryLength?: number
  request: Request
  run: (query: string, userId: string) => Promise<TResponse>
}

type ExternalSearchConfig<TLocal, TExternal> = {
  getExternalTmdbId: (item: TExternal) => number
  getLocalTmdbId: (item: TLocal) => number | null | undefined
  localResults: TLocal[]
  query: string
  searchExternal: (query: string) => Promise<TExternal[]>
}

function getSearchQuery(request: Request) {
  return new URL(request.url).searchParams.get('q')?.trim() || ''
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      code,
      message,
    },
    { status }
  )
}

export async function handlePublicSearchRoute<TResponse>({
  emptyResponse,
  internalErrorMessage,
  logLabel,
  minQueryLength = 2,
  request,
  run,
}: SearchRouteConfig<TResponse>) {
  const query = getSearchQuery(request)

  if (query.length < minQueryLength) {
    return NextResponse.json(emptyResponse)
  }

  try {
    return NextResponse.json(await run(query))
  } catch (error) {
    console.error(logLabel, error)

    return jsonError('INTERNAL_ERROR', internalErrorMessage, 500)
  }
}

export async function handleAuthenticatedSearchRoute<TResponse>({
  emptyResponse,
  internalErrorMessage,
  logLabel,
  minQueryLength = 2,
  request,
  run,
}: AuthenticatedSearchRouteConfig<TResponse>) {
  const query = getSearchQuery(request)

  if (query.length < minQueryLength) {
    return NextResponse.json(emptyResponse)
  }

  try {
    const userId = await requireUserId()

    return NextResponse.json(await run(query, userId))
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return jsonError('UNAUTHORIZED', error.message, 401)
    }

    console.error(logLabel, error)

    return jsonError('INTERNAL_ERROR', internalErrorMessage, 500)
  }
}

export async function searchExternalResults<TLocal, TExternal>({
  getExternalTmdbId,
  getLocalTmdbId,
  localResults,
  query,
  searchExternal,
}: ExternalSearchConfig<TLocal, TExternal>): Promise<TExternal[]> {
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
