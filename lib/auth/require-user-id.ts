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

export async function requireUserId() {
  const userId = await getCurrentUserId()

  if (!userId) {
    throw new AuthRequiredError()
  }

  return userId
}
