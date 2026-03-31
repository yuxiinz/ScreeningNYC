'use client'

import { useState } from 'react'

type EmailReminderToggleProps = {
  initialEnabled: boolean
}

export default function EmailReminderToggle({
  initialEnabled,
}: EmailReminderToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleChange(nextEnabled: boolean) {
    setEnabled(nextEnabled)
    setPending(true)
    setError('')

    try {
      const response = await fetch('/api/me/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          watchlistEmailEnabled: nextEnabled,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update reminder settings.')
      }
    } catch {
      setEnabled(!nextEnabled)
      setError('Could not update email reminders.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <label className="flex items-start justify-between gap-4 rounded-panel border border-border-default bg-page-bg px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[0.92rem] font-semibold">Want list email reminders</p>
          <p className="m-0 text-[0.82rem] leading-[1.5] text-text-secondary">
            Sends a Friday summary for wanted films already on screen, or a noon alert when a previously off-screen pick starts showing.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!pending) {
              void handleChange(!enabled)
            }
          }}
          aria-pressed={enabled}
          className={[
            'relative mt-0.5 h-7 w-13 shrink-0 self-start rounded-full transition-colors',
            enabled ? 'bg-[#2050ff]' : 'bg-border-strong',
            pending ? 'opacity-60' : '',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </label>

      {error && (
        <p className="mt-3 text-[0.82rem] text-[#ffb3b3]">{error}</p>
      )}
    </div>
  )
}
