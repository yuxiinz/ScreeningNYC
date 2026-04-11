// app/api/auth/register/route.ts

import { NextResponse } from 'next/server'

import { buildInvalidJsonResponse, jsonError } from '@/lib/api/route'
import { registerUser } from '@/lib/auth/register'

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return buildInvalidJsonResponse()
  }

  const email =
    typeof (body as { email?: unknown })?.email === 'string'
      ? (body as { email: string }).email
      : ''
  const password =
    typeof (body as { password?: unknown })?.password === 'string'
      ? (body as { password: string }).password
      : ''
  const name =
    typeof (body as { name?: unknown })?.name === 'string'
      ? (body as { name: string }).name
      : null

  const result = await registerUser({
    email,
    password,
    name,
  })

  if (result.ok) {
    return NextResponse.json(
      {
        email: result.email,
      },
      { status: 201 }
    )
  }

  const status =
    result.code === 'EMAIL_ALREADY_IN_USE'
      ? 409
      : result.code === 'EMAIL_ALREADY_REGISTERED_UNVERIFIED'
        ? 409
        : result.code === 'EMAIL_NOT_CONFIGURED'
          ? 503
          : 400

  return jsonError(result.code, result.message, status)
}
