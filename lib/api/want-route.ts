import { NextResponse } from 'next/server'

import {
  buildUnauthorizedResponse,
  getPositiveIntegerParam,
  jsonError,
} from '@/lib/api/route'
import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'

type WantMutationResult = Record<string, unknown>

type WantRouteConfig<TParamKey extends string, TResult extends WantMutationResult> = {
  addWant: (userId: string, entityId: number) => Promise<TResult>
  internalErrorMessage: string
  invalidParamCode: string
  invalidParamMessage: string
  logLabel: string
  paramKey: TParamKey
  removeWant: (userId: string, entityId: number) => Promise<TResult>
}

type WantRouteContext<TParamKey extends string> = {
  params: Promise<Record<TParamKey, string>>
}

function createWantHandler<TParamKey extends string, TResult extends WantMutationResult>(
  method: 'PUT' | 'DELETE',
  mutateWant: (userId: string, entityId: number) => Promise<TResult>,
  {
    internalErrorMessage,
    invalidParamCode,
    invalidParamMessage,
    logLabel,
    paramKey,
  }: Omit<WantRouteConfig<TParamKey, TResult>, 'addWant' | 'removeWant'>
) {
  return async (
    _request: Request,
    { params }: WantRouteContext<TParamKey>
  ) => {
    try {
      const [userId, entityId] = await Promise.all([
        requireUserId(),
        getPositiveIntegerParam(
          params as Promise<Record<string, string>>,
          paramKey
        ),
      ])

      if (!entityId) {
        return jsonError(invalidParamCode, invalidParamMessage, 400)
      }

      const result = await mutateWant(userId, entityId)

      return NextResponse.json({
        ok: true,
        ...result,
      })
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        return buildUnauthorizedResponse(error.message)
      }

      console.error(`${logLabel}[${method}]`, error)
      return jsonError('INTERNAL_ERROR', internalErrorMessage, 500)
    }
  }
}

export function createWantRouteHandlers<
  TParamKey extends string,
  TResult extends WantMutationResult,
>(config: WantRouteConfig<TParamKey, TResult>) {
  return {
    PUT: createWantHandler('PUT', config.addWant, config),
    DELETE: createWantHandler('DELETE', config.removeWant, config),
  }
}
