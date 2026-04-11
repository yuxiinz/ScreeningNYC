import { AuthRequiredError } from '@/lib/auth/require-user-id'
import {
  buildUnauthorizedResponse,
  getPositiveIntegerParam,
  jsonError,
} from '@/lib/api/route'
import {
  MarketplaceNotFoundError,
  MarketplaceValidationError,
} from '@/lib/marketplace/errors'

export function jsonMarketplaceError(
  code: string,
  message: string,
  status: number
) {
  return jsonError(code, message, status)
}

export function buildMarketplaceUnauthorizedResponse(error: AuthRequiredError) {
  return buildUnauthorizedResponse(error.message)
}

export { getPositiveIntegerParam }

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
