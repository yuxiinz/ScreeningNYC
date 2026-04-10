'use client'

import type { ChangeEvent } from 'react'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { getErrorMessageFromResponse } from '@/lib/api/client-response'
import type { MovieImportSummary } from '@/lib/user-movies/import'

type MovieCsvImportButtonProps = {
  listType: 'want' | 'watched'
  className?: string
}

type ImportResponsePayload = MovieImportSummary & {
  ok?: boolean
  message?: string
}

function getProviderLabel(provider: MovieImportSummary['provider']) {
  return provider === 'douban' ? 'Douban' : 'Letterboxd'
}

export default function MovieCsvImportButton({
  listType,
  className,
}: MovieCsvImportButtonProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<MovieImportSummary | null>(null)

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setPending(true)
    setError('')
    setSummary(null)

    try {
      const csvContent = await file.text()
      const response = await fetch('/api/me/movies/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listType,
          csvContent,
        }),
      })

      if (!response.ok) {
        throw new Error(
          await getErrorMessageFromResponse(
            response,
            'Could not import this file right now.'
          )
        )
      }

      const payload = (await response.json()) as ImportResponsePayload
      const nextSummary: MovieImportSummary = {
        provider: payload.provider,
        totalRows: payload.totalRows,
        importedCount: payload.importedCount,
        alreadyPresentCount: payload.alreadyPresentCount,
        failedCount: payload.failedCount,
        items: payload.items,
      }

      setSummary(nextSummary)

      if (nextSummary.totalRows > nextSummary.failedCount) {
        router.refresh()
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Could not import this file right now.'
      )
    } finally {
      setPending(false)
    }
  }

  const failedItems = summary?.items.filter((item) => item.status === 'failed') || []

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        className="hidden"
        onChange={(event) => {
          void handleFileChange(event)
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (!pending) {
              fileInputRef.current?.click()
            }
          }}
          disabled={pending}
          className="rounded-panel border border-text-primary bg-text-primary px-4 py-3 text-[0.76rem] font-bold tracking-[0.08em] text-page-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'IMPORTING...' : 'IMPORT CSV'}
        </button>

        {summary ? (
          <button
            type="button"
            onClick={() => {
              setSummary(null)
              setError('')
            }}
            disabled={pending}
            className="rounded-panel border border-border-input px-3 py-3 text-[0.76rem] font-semibold tracking-[0.06em] text-text-secondary transition-colors hover:border-text-primary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            CLEAR RESULT
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-[0.76rem] leading-[1.5] text-text-dim">
        Supports Douban and Letterboxd CSV or TSV exports.
      </p>

      {error ? (
        <p className="mt-2 text-[0.78rem] leading-[1.5] text-status-error">{error}</p>
      ) : null}

      {summary ? (
        <div className="mt-4 rounded-panel border border-border-default bg-card-bg p-4 shadow-card">
          <p className="mb-2 text-[0.76rem] font-semibold tracking-[0.08em] text-text-dim">
            {getProviderLabel(summary.provider).toUpperCase()} IMPORT
          </p>
          <p className="m-0 text-[0.88rem] leading-[1.6] text-text-secondary">
            Imported {summary.importedCount}, already present {summary.alreadyPresentCount},
            failed {summary.failedCount}, total rows {summary.totalRows}.
          </p>

          {failedItems.length > 0 ? (
            <div className="mt-4 rounded-panel border border-border-input bg-page-bg p-3">
              <p className="mb-2 text-[0.76rem] font-semibold tracking-[0.08em] text-text-dim">
                FAILED ROWS
              </p>
              <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                {failedItems.map((item) => (
                  <p
                    key={`${item.rowNumber}-${item.title}`}
                    className="m-0 text-[0.82rem] leading-[1.6] text-status-error"
                  >
                    Row {item.rowNumber}: {item.title}. {item.message || 'Import failed.'}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
