import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import LoginPanel from '@/components/auth/LoginPanel'
import { getAuthFeatureFlags } from '@/lib/auth/env'

type LoginPageSearchParams = {
  email?: string | string[]
  redirectTo?: string | string[]
}

function getFirstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

function getSafeRedirectTo(value?: string | string[]) {
  const candidate = getFirstValue(value)

  if (!candidate || !candidate.startsWith('/')) {
    return '/me'
  }

  return candidate
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginPageSearchParams>
}) {
  const session = await auth()

  if (session?.user) {
    redirect('/me')
  }

  const params = await searchParams
  const authFeatures = getAuthFeatureFlags()

  return (
    <main className="mx-auto max-w-[560px]">
      <LoginPanel
        redirectTo={getSafeRedirectTo(params.redirectTo)}
        initialEmail={getFirstValue(params.email) || ''}
        googleEnabled={authFeatures.google}
        magicLinkEnabled={authFeatures.magicLink}
      />
    </main>
  )
}
