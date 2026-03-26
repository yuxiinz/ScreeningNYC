import Link from 'next/link'

import ResendVerificationForm from '@/components/auth/ResendVerificationForm'

type VerifyEmailPageSearchParams = {
  email?: string | string[]
  status?: string | string[]
}

function getFirstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

function getStatusMessage(status?: string) {
  if (status === 'sent') {
    return 'Verification email sent. Open the link in your inbox to activate password login.'
  }

  if (status === 'resent') {
    return 'A fresh verification email is on the way.'
  }

  if (status === 'verified') {
    return 'Email verified. You can now log in with your password.'
  }

  if (status === 'expired') {
    return 'That verification link has expired. Request a new one below.'
  }

  if (status === 'invalid') {
    return 'That verification link is invalid or already used.'
  }

  return 'Verify your email to activate password login.'
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<VerifyEmailPageSearchParams>
}) {
  const params = await searchParams
  const email = getFirstValue(params.email) || ''
  const status = getFirstValue(params.status) || ''
  const message = getStatusMessage(status)
  const isSuccess = status === 'verified' || status === 'sent' || status === 'resent'

  return (
    <main className="mx-auto max-w-[560px]">
      <section className="rounded-panel border border-border-default bg-card-bg p-6 shadow-card">
        <h1 className="mb-2 text-[2.1rem] font-black leading-[1.05]">
          VERIFY EMAIL
        </h1>

        <p
          className={[
            'mb-5 text-[0.95rem] leading-[1.6]',
            isSuccess ? 'text-text-primary' : 'text-text-secondary',
          ].join(' ')}
        >
          {message}
        </p>

        {status === 'verified' ? (
          <Link
            href={email ? `/login?email=${encodeURIComponent(email)}` : '/login'}
            className="inline-block rounded-panel border border-text-primary bg-text-primary px-4 py-3 text-[0.9rem] font-bold text-page-bg no-underline"
          >
            Continue to login
          </Link>
        ) : (
          <ResendVerificationForm defaultEmail={email} />
        )}
      </section>
    </main>
  )
}
