import { redirect } from 'next/navigation'

import { auth } from '@/auth'

export class AuthRequiredError extends Error {
  constructor(message = 'Sign in required.') {
    super(message)
    this.name = 'AuthRequiredError'
  }
}

export async function getCurrentUserId() {
  const session = await auth()
  return session?.user?.id || null
}

function buildLoginRedirectHref(redirectTo: string) {
  const normalizedRedirectTo = redirectTo.startsWith('/')
    ? redirectTo
    : `/${redirectTo}`

  return `/login?redirectTo=${encodeURIComponent(normalizedRedirectTo)}`
}

export async function requireUserId() {
  const userId = await getCurrentUserId()

  if (!userId) {
    throw new AuthRequiredError()
  }

  return userId
}

export async function requireUserIdForPage(redirectTo: string) {
  const userId = await getCurrentUserId()

  if (!userId) {
    redirect(buildLoginRedirectHref(redirectTo))
  }

  return userId
}
