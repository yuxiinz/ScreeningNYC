import { NextResponse } from 'next/server'

import {
  buildInvalidJsonResponse,
  buildUnauthorizedResponse,
  jsonError,
} from '@/lib/api/route'
import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import { TmdbApiKeyMissingError } from '@/lib/tmdb/client'

type ErrorConstructor = abstract new (...args: never[]) => Error

type ResolveRouteErrorConfig = {
  code: string
  errorType: ErrorConstructor
  status: number
}

type TmdbResolveRouteConfig<TResult> = {
  buildSuccessBody: (result: TResult) => Record<string, unknown>
  customErrors?: ResolveRouteErrorConfig[]
  internalErrorMessage: string
  logLabel: string
  request: Request
  resolveEntity: (tmdbId: number) => Promise<TResult>
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json()
  } catch {
    return buildInvalidJsonResponse()
  }
}

function parsePositiveInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return jsonError('INVALID_TMDB_ID', 'tmdbId must be a positive integer.', 400)
  }

  return value
}

export async function handleTmdbResolveRoute<TResult>({
  buildSuccessBody,
  customErrors = [],
  internalErrorMessage,
  logLabel,
  request,
  resolveEntity,
}: TmdbResolveRouteConfig<TResult>) {
  const body = await parseJsonBody(request)

  if (body instanceof NextResponse) {
    return body
  }

  const tmdbId = parsePositiveInteger((body as { tmdbId?: unknown })?.tmdbId)

  if (tmdbId instanceof NextResponse) {
    return tmdbId
  }

  try {
    await requireUserId()

    const result = await resolveEntity(tmdbId)

    return NextResponse.json(buildSuccessBody(result))
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error.message)
    }

    if (error instanceof TmdbApiKeyMissingError) {
      return jsonError('TMDB_NOT_CONFIGURED', error.message, 503)
    }

    for (const config of customErrors) {
      if (error instanceof config.errorType) {
        return jsonError(config.code, error.message, config.status)
      }
    }

    console.error(logLabel, error)

    return jsonError('INTERNAL_ERROR', internalErrorMessage, 500)
  }
}
