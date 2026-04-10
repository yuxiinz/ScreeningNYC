'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

type AccountProfileFormProps = {
  initialName: string
}

type AccountUpdateErrorResponse = {
  name?: string | null
  message?: string
}

export default function AccountProfileForm({
  initialName,
}: AccountProfileFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/me/account', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as AccountUpdateErrorResponse
        setError(payload.message || 'Could not update account details.')
        return
      }

      const payload = (await response.json()) as AccountUpdateErrorResponse
      setName(payload.name || '')
      setMessage('Account details updated.')
      router.refresh()
    } catch {
      setError('Could not update account details.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
        NAME
      </label>
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="name"
        className="rounded-panel border border-border-input bg-page-bg px-4 py-3 outline-none"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-panel border border-text-primary bg-text-primary px-4 py-3 text-[0.9rem] font-bold text-page-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Saving...' : 'Save name'}
      </button>

      {(error || message) && (
        <div
          className={[
            'rounded-panel border px-4 py-3 text-[0.9rem] leading-[1.5]',
            error
              ? 'border-status-error-border bg-status-error-bg text-status-error'
              : 'border-status-success-border bg-status-success-bg text-status-success',
          ].join(' ')}
        >
          {error || message}
        </div>
      )}
    </form>
  )
}
