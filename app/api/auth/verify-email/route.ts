import { NextResponse } from 'next/server'

import { consumeEmailVerificationToken } from '@/lib/auth/email-verification'
import { getAppBaseUrl } from '@/lib/auth/env'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token') || ''
  const result = await consumeEmailVerificationToken(token)

  const redirectUrl = new URL('/verify-email', getAppBaseUrl())
  redirectUrl.searchParams.set('status', result.status)

  if ('email' in result && result.email) {
    redirectUrl.searchParams.set('email', result.email)
  }

  return NextResponse.redirect(redirectUrl)
}
