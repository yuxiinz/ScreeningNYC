import { NextResponse } from 'next/server'

import { AuthRequiredError } from '@/lib/auth/require-user-id'
import {
  MarketplaceNotFoundError,
  MarketplaceValidationError,
} from '@/lib/marketplace/errors'

export function jsonMarketplaceError(
  code: string,
  message: string,
  status: number
) {
  return NextResponse.json(
    {
      code,
      message,
    },
    { status }
  )
}

export function buildMarketplaceUnauthorizedResponse(error: AuthRequiredError) {
  return jsonMarketplaceError('UNAUTHORIZED', error.message, 401)
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

export async function getPositiveIntegerParam(
  params: Promise<Record<string, string>>,
  key: string
) {
  const values = await params
  const parsedValue = Number.parseInt(values[key] || '', 10)

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null
  }

  return parsedValue
}

export async function readJsonBody(request: Request) {
  try {
    return await request.json()
  } catch {
    throw new MarketplaceValidationError('Request body must be valid JSON.')
  }
}
