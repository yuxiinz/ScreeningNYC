import { NextResponse } from 'next/server'

import { resendRegistrationVerificationEmail } from '@/lib/auth/register'

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON.',
      },
      { status: 400 }
    )
  }

  const email =
    typeof (body as { email?: unknown })?.email === 'string'
      ? (body as { email: string }).email
      : ''

  const result = await resendRegistrationVerificationEmail(email)

  if (result.ok) {
    return NextResponse.json({ ok: true })
  }

  const status = result.code === 'EMAIL_NOT_CONFIGURED' ? 503 : 400

  return NextResponse.json(
    {
      code: result.code,
      message: result.message,
    },
    { status }
  )
}
