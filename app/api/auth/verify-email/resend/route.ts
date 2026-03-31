// app/api/auth/verify-email/resend/route.ts

import { NextResponse } from 'next/server'
import { resendRegistrationVerificationEmail } from '@/lib/auth/register'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

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

  const rawEmail =
    typeof (body as { email?: unknown })?.email === 'string'
      ? (body as { email: string }).email
      : ''

  const email = rawEmail.trim().toLowerCase()

  if (!email) {
    return NextResponse.json(
      {
        code: 'EMAIL_REQUIRED',
        message: 'Email is required.',
      },
      { status: 400 }
    )
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      {
        code: 'INVALID_EMAIL',
        message: 'Email format is invalid.',
      },
      { status: 400 }
    )
  }

  try {
    const result = await resendRegistrationVerificationEmail(email)

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        message: 'A verification email has been sent.',
      })
    }

    if (result.code === 'EMAIL_NOT_CONFIGURED') {
      return NextResponse.json(
        {
          code: result.code,
          message: 'Email service is not configured.',
        },
        { status: 503 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: 'A verification email has been sent.',
    })
  } catch (error) {
    console.error('verify email resend failed:', error)

    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
      },
      { status: 500 }
    )
  }
}