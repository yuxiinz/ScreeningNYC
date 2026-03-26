'use client'

import { FormEvent, useState } from 'react'

type ResendVerificationFormProps = {
  defaultEmail?: string
}

type ResendErrorResponse = {
  message?: string
}

export default function ResendVerificationForm({
  defaultEmail = '',
}: ResendVerificationFormProps) {
  const [email, setEmail] = useState(defaultEmail)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/auth/verify-email/resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as ResendErrorResponse
        setError(payload.message || 'Could not resend verification email.')
        return
      }

      setMessage('If this account still needs verification, we sent a fresh email.')
    } catch {
      setError('Could not resend verification email.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
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

      <button
        type="submit"
        disabled={pending}
        className="rounded-panel border border-border-input px-4 py-3 text-[0.9rem] font-semibold transition-colors hover:border-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Resending...' : 'Resend verification email'}
      </button>

      {(error || message) && (
        <div
          className={[
            'rounded-panel border px-4 py-3 text-[0.9rem] leading-[1.5]',
            error
              ? 'border-[#6b2c2c] bg-[#261313] text-[#ffb3b3]'
              : 'border-[#23452a] bg-[#102114] text-[#9fddb0]',
          ].join(' ')}
        >
          {error || message}
        </div>
      )}
    </form>
  )
}
