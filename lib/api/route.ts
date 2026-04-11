import { NextResponse } from 'next/server'

export function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      code,
      message,
    },
    { status }
  )
}

export function buildUnauthorizedResponse(message = 'Sign in required.') {
  return jsonError('UNAUTHORIZED', message, 401)
}

export function buildInvalidJsonResponse() {
  return jsonError('INVALID_JSON', 'Request body must be valid JSON.', 400)
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
