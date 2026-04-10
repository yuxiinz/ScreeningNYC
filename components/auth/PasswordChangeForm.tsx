'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

type PasswordChangeFormProps = {
  initialHasPassword: boolean
}

type AccountUpdateErrorResponse = {
  message?: string
}

export default function PasswordChangeForm({
  initialHasPassword,
}: PasswordChangeFormProps) {
  const router = useRouter()
  const [hasPassword, setHasPassword] = useState(initialHasPassword)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    setMessage('')
    const isCreatingPassword = !hasPassword

    if (hasPassword && !currentPassword) {
      setPending(false)
      setError('Enter your current password.')
      return
    }

    if (!newPassword) {
      setPending(false)
      setError('Enter a new password.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPending(false)
      setError('New password and confirmation must match.')
      return
    }

    try {
      const response = await fetch('/api/me/account', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as AccountUpdateErrorResponse
        setError(payload.message || 'Could not update password.')
        return
      }

      setHasPassword(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage(isCreatingPassword ? 'Password created.' : 'Password updated.')
      router.refresh()
    } catch {
      setError('Could not update password.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="m-0 text-[0.84rem] leading-[1.6] text-text-secondary">
        {hasPassword
          ? 'Change the password used for email login.'
          : 'Set a password if you want to sign in with email and password.'}
      </p>

      {hasPassword && (
        <>
          <label className="text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
            CURRENT PASSWORD
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            className="rounded-panel border border-border-input bg-page-bg px-4 py-3 outline-none"
          />
        </>
      )}

      <label className="text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
        NEW PASSWORD
      </label>
      <input
        type="password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        autoComplete="new-password"
        className="rounded-panel border border-border-input bg-page-bg px-4 py-3 outline-none"
      />

      <label className="text-[0.78rem] font-semibold tracking-[0.08em] text-text-dim">
        CONFIRM NEW PASSWORD
      </label>
      <input
        type="password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        autoComplete="new-password"
        className="rounded-panel border border-border-input bg-page-bg px-4 py-3 outline-none"
      />

      <p className="m-0 text-[0.8rem] leading-[1.5] text-text-secondary">
        Passwords must be at least 8 characters long.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-panel border border-text-primary bg-text-primary px-4 py-3 text-[0.9rem] font-bold text-page-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? hasPassword
            ? 'Updating password...'
            : 'Creating password...'
          : hasPassword
            ? 'Update password'
            : 'Create password'}
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
