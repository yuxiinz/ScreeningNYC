import { NextResponse } from 'next/server'

import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import { buildUnauthorizedResponse, getPositiveIntegerParam, jsonError } from '@/lib/api/route'
import { MarketplaceNotFoundError, MarketplaceValidationError } from '@/lib/marketplace/errors'

export function jsonMarketplaceError(
  code: string,
  message: string,
  status: number
) {
  return jsonError(code, message, status)
}

function buildMarketplaceUnauthorizedResponse(error: AuthRequiredError) {
  return buildUnauthorizedResponse(error.message)
}

type MarketplacePostRouteContext = { params: Promise<{ postId: string }> }

type MarketplaceRouteConfig<TResult> = {
  buildSuccessBody: (result: TResult) => Record<string, unknown>
  fallbackMessage: string
  logLabel: string
}

type MarketplacePostIdRouteConfig<TResult, TBody = undefined> =
  MarketplaceRouteConfig<TResult> & {
    parseBody?: (request: Request) => Promise<TBody> | TBody
    run: (input: { userId: string; postId: number; body: TBody }) => Promise<TResult>
  }

type MarketplaceBodyRouteConfig<TResult, TBody> = MarketplaceRouteConfig<TResult> & {
  parseBody: (body: unknown) => TBody
  run: (input: { userId: string; body: TBody }) => Promise<TResult>
}

export function buildMarketplaceServiceErrorResponse(
  error: unknown,
  {
    fallbackMessage,
    logLabel,
  }: {
    fallbackMessage: string
    logLabel: string
  }
) {
  if (error instanceof MarketplaceValidationError) {
    return jsonMarketplaceError('INVALID_INPUT', error.message, 400)
  }

  if (error instanceof MarketplaceNotFoundError) {
    return jsonMarketplaceError('NOT_FOUND', error.message, 404)
  }

  console.error(logLabel, error)

  return jsonMarketplaceError('INTERNAL_ERROR', fallbackMessage, 500)
}

export async function readJsonBody(request: Request) {
  try {
    return await request.json()
  } catch {
    throw new MarketplaceValidationError('Request body must be valid JSON.')
  }
}

async function runMarketplaceRoute<TResult>(
  {
    buildSuccessBody,
    fallbackMessage,
    logLabel,
  }: MarketplaceRouteConfig<TResult>,
  run: () => Promise<TResult | Response>
) {
  try {
    const result = await run()

    if (result instanceof Response) {
      return result
    }

    return NextResponse.json({
      ok: true,
      ...buildSuccessBody(result),
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildMarketplaceUnauthorizedResponse(error)
    }

    return buildMarketplaceServiceErrorResponse(error, {
      fallbackMessage,
      logLabel,
    })
  }
}

export function createMarketplaceBodyRoute<TResult, TBody>({
  buildSuccessBody,
  fallbackMessage,
  logLabel,
  parseBody,
  run,
}: MarketplaceBodyRouteConfig<TResult, TBody>) {
  return async (request: Request) =>
    runMarketplaceRoute({ buildSuccessBody, fallbackMessage, logLabel }, async () => {
      const [userId, body] = await Promise.all([requireUserId(), readJsonBody(request)])
      return run({
        userId,
        body: parseBody(body),
      })
    })
}

export function createMarketplacePostIdRoute<TResult, TBody = undefined>({
  buildSuccessBody,
  fallbackMessage,
  logLabel,
  parseBody,
  run,
}: MarketplacePostIdRouteConfig<TResult, TBody>) {
  return async (request: Request, { params }: MarketplacePostRouteContext) =>
    runMarketplaceRoute({ buildSuccessBody, fallbackMessage, logLabel }, async () => {
      const [userId, postId, body] = await Promise.all([
        requireUserId(),
        getPositiveIntegerParam(params, 'postId'),
        parseBody
          ? Promise.resolve(parseBody(request))
          : Promise.resolve(undefined as TBody),
      ])

      if (!postId) {
        return jsonError('INVALID_POST_ID', 'postId must be a positive integer.', 400)
      }

      return run({
        userId,
        postId,
        body,
      })
    })
}
