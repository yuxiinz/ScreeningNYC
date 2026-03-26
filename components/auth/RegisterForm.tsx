'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

type RegisterFormProps = {
  loginHref?: string
}

type RegisterErrorResponse = {
  code?: string
  message?: string
}

export default function RegisterForm({
  loginHref = '/login',
}: RegisterFormProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      })

      if (response.ok) {
        router.push(`/verify-email?status=sent&email=${encodeURIComponent(email.trim())}`)
        return
      }

      const payload = (await response.json()) as RegisterErrorResponse

      if (payload.code === 'EMAIL_ALREADY_REGISTERED_UNVERIFIED') {
        router.push(`/verify-email?status=resent&email=${encodeURIComponent(email.trim())}`)
        return
      }

      setError(payload.message || 'Registration failed.')
    } catch {
      setError('Registration failed. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-panel border border-border-default bg-card-bg p-6 shadow-card">
      <div className="mb-6">
        <h1 className="mb-2 text-[2.1rem] font-black leading-[1.05]">
          CREATE ACCOUNT
        </h1>
        <p className="m-0 text-[0.95rem] leading-[1.6] text-text-secondary">
          Password login requires email verification. Magic link and Google will still be available on the login page.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
          NAME (OPTIONAL)
        </label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          className="rounded-panel border border-border-input bg-page-bg px-4 py-3 outline-none"
        />

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
          autoComplete="new-password"
          className="rounded-panel border border-border-input bg-page-bg px-4 py-3 outline-none"
        />

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-panel border border-text-primary bg-text-primary px-4 py-3 text-[0.9rem] font-bold text-page-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-panel border border-[#6b2c2c] bg-[#261313] px-4 py-3 text-[0.9rem] leading-[1.5] text-[#ffb3b3]">
          {error}
        </div>
      )}

      <p className="mt-6 text-[0.88rem] leading-[1.6] text-text-secondary">
        Already have an account?{' '}
        <Link href={loginHref} className="border-b border-text-primary text-text-primary">
          Log in
        </Link>
      </p>
    </section>
  )
}
