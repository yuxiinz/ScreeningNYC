import { NextResponse } from 'next/server'

import {
  buildInvalidJsonResponse,
  buildUnauthorizedResponse,
  jsonError,
} from '@/lib/api/route'
import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import { TmdbApiKeyMissingError } from '@/lib/tmdb/client'

type ResolveRouteErrorConfig = {
  code: string
  status: number
  when: abstract new (...args: never[]) => Error
}

type TmdbResolveRouteConfig = {
  errors?: ResolveRouteErrorConfig[]
  internalErrorMessage: string
  logLabel: string
  resolve: (tmdbId: number) => Promise<Record<string, unknown>>
}

async function parseTmdbId(request: Request) {
  try {
    const { tmdbId } = (await request.json()) as { tmdbId?: unknown }

    if (typeof tmdbId === 'number' && Number.isInteger(tmdbId) && tmdbId > 0) {
      return tmdbId
    }
  } catch {
    return buildInvalidJsonResponse()
  }

  return jsonError('INVALID_TMDB_ID', 'tmdbId must be a positive integer.', 400)
}

export function createTmdbResolveRoute({
  errors = [],
  internalErrorMessage,
  logLabel,
  resolve,
}: TmdbResolveRouteConfig) {
  return async (request: Request) => {
    const tmdbId = await parseTmdbId(request)

    if (tmdbId instanceof NextResponse) {
      return tmdbId
    }

    try {
      await requireUserId()

      return NextResponse.json(await resolve(tmdbId))
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        return buildUnauthorizedResponse(error.message)
      }

      if (error instanceof TmdbApiKeyMissingError) {
        return jsonError('TMDB_NOT_CONFIGURED', error.message, 503)
      }

      for (const { code, status, when } of errors) {
        if (error instanceof when) {
          return jsonError(code, error.message, status)
        }
      }

      console.error(logLabel, error)

      return jsonError('INTERNAL_ERROR', internalErrorMessage, 500)
    }
  }
}
