import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import LoginPanel from '@/components/auth/LoginPanel'
import { getAuthFeatureFlags } from '@/lib/auth/env'
import { getFirstSearchParamValue } from '@/lib/routing/search-params'

type LoginPageSearchParams = {
  email?: string | string[]
  redirectTo?: string | string[]
}

function getSafeRedirectTo(value?: string | string[]) {
  const candidate = getFirstSearchParamValue(value)

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
  const params = await searchParams

  if (session?.user?.id) {
    redirect(getSafeRedirectTo(params.redirectTo))
  }

  const authFeatures = getAuthFeatureFlags()

  return (
    <main className="mx-auto max-w-[560px]">
      <LoginPanel
        redirectTo={getSafeRedirectTo(params.redirectTo)}
        initialEmail={getFirstSearchParamValue(params.email) || ''}
        googleEnabled={authFeatures.google}
        magicLinkEnabled={authFeatures.magicLink}
      />
    </main>
  )
}
