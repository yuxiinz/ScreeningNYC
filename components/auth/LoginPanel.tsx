'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { signIn } from 'next-auth/react'

type LoginPanelProps = {
  redirectTo: string
  googleEnabled: boolean
  magicLinkEnabled: boolean
  initialEmail?: string
}

type PendingAction = 'password' | 'magic-link' | 'google' | null

function isValidEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())
}

export default function LoginPanel({
  redirectTo,
  googleEnabled,
  magicLinkEnabled,
  initialEmail = '',
}: LoginPanelProps) {
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!isValidEmail(email)) {
      setError('Enter a valid email address.')
      return
    }

    if (!password) {
      setError('Enter your password.')
      return
    }

    setPendingAction('password')

    try {
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
        redirectTo,
      })

      if (result?.ok && result.url) {
        router.push(result.url)
        router.refresh()
        return
      }

      if (result?.code === 'email_not_verified') {
        setError('Verify your email before using password login.')
      } else {
        setError('Invalid email or password.')
      }
    } catch {
      setError('Password login failed. Try again.')
    } finally {
      setPendingAction(null)
    }
  }

  async function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (!magicLinkEnabled) {
      setError('Magic link login is not configured yet.')
      return
    }

    if (!isValidEmail(email)) {
      setError('Enter a valid email address.')
      return
    }

    setPendingAction('magic-link')

    try {
      const result = await signIn('resend', {
        email: email.trim(),
        redirect: false,
        redirectTo,
      })

      if (result?.error) {
        setError('Could not send a magic link right now.')
        return
      }

      setMessage('Magic link sent. Check your inbox.')
    } catch {
      setError('Could not send a magic link right now.')
    } finally {
      setPendingAction(null)
    }
  }

  async function handleGoogleSignIn() {
    setMessage('')
    setError('')

    if (!googleEnabled) {
      setError('Google login is not configured yet.')
      return
    }

    setPendingAction('google')

    try {
      await signIn('google', {
        redirectTo,
      })
    } catch {
      setError('Google sign-in failed. Try again.')
      setPendingAction(null)
    }
  }

  return (
    <section className="rounded-panel border border-border-default bg-card-bg p-6 shadow-card">
      <div className="mb-6">
        <h1 className="mb-2 text-[2.1rem] font-black leading-[1.05]">
          LOGIN
        </h1>
        <p className="m-0 text-[0.95rem] leading-[1.6] text-text-secondary">
          Use a password, a magic link, or Google.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={pendingAction !== null}
          className="w-full rounded-panel border border-border-input px-4 py-3 text-left text-[0.95rem] font-semibold transition-colors hover:border-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === 'google'
            ? 'Connecting to Google...'
            : googleEnabled
              ? 'Continue with Google'
              : 'Google login unavailable'}
        </button>
      </div>

      <div className="mb-6 h-px bg-border-subtle" />

      <form onSubmit={handlePasswordSubmit} className="mb-6 flex flex-col gap-3">
        <label className="text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
          EMAIL
        </label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className="rounded-panel border border-border-input bg-page-bg px-4 py-3 outline-none"
        />

        <label className="text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
          PASSWORD
        </label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          className="rounded-panel border border-border-input bg-page-bg px-4 py-3 outline-none"
        />

        <button
          type="submit"
          disabled={pendingAction !== null}
          className="mt-2 rounded-panel border border-text-primary bg-text-primary px-4 py-3 text-[0.9rem] font-bold text-page-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === 'password' ? 'Signing in...' : 'Sign in with password'}
        </button>
      </form>

      <form onSubmit={handleMagicLinkSubmit} className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={pendingAction !== null}
          className="rounded-panel border border-border-input px-4 py-3 text-[0.9rem] font-semibold transition-colors hover:border-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === 'magic-link'
            ? 'Sending magic link...'
            : magicLinkEnabled
              ? 'Send magic link'
              : 'Magic link unavailable'}
        </button>
      </form>

      {(error || message) && (
        <div
          className={[
            'mt-6 rounded-panel border px-4 py-3 text-[0.9rem] leading-[1.5]',
            error
              ? 'border-status-error-border bg-status-error-bg text-status-error'
              : 'border-status-success-border bg-status-success-bg text-status-success',
          ].join(' ')}
        >
          {error || message}
        </div>
      )}

      <p className="mt-6 text-[0.88rem] leading-[1.6] text-text-secondary">
        Need a password account?{' '}
        <Link href="/register" className="border-b border-text-primary text-text-primary">
          Create one
        </Link>
      </p>
    </section>
  )
}
