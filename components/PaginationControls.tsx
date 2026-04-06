'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 1), totalPages)
}

function getButtonClass(disabled: boolean) {
  return disabled
    ? 'cursor-not-allowed text-[0.88rem] text-text-disabled'
    : 'cursor-pointer border-none bg-transparent p-0 text-[0.88rem] text-text-primary'
}

export default function PaginationControls({
  currentPage,
  totalPages,
}: {
  currentPage: number
  totalPages: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pageInput, setPageInput] = useState(String(currentPage))

  useEffect(() => {
    setPageInput(String(currentPage))
  }, [currentPage])

  function navigateToPage(page: number) {
    const nextPage = clampPage(page, totalPages)
    const params = new URLSearchParams(searchParams.toString())

    if (nextPage <= 1) {
      params.delete('page')
    } else {
      params.set('page', String(nextPage))
    }

    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsedPage = Number.parseInt(pageInput, 10)

    if (!Number.isFinite(parsedPage)) {
      setPageInput(String(currentPage))
      return
    }

    navigateToPage(parsedPage)
  }

  const isAtFirstPage = currentPage <= 1
  const isAtLastPage = currentPage >= totalPages

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border-default pt-5">
      <span className="text-[0.85rem] tracking-[0.05em] text-text-muted">
        PAGE {currentPage} / {totalPages}
      </span>

      <div className="flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigateToPage(1)}
            disabled={isAtFirstPage}
            className={getButtonClass(isAtFirstPage)}
          >
            FIRST
          </button>

          <button
            type="button"
            onClick={() => navigateToPage(currentPage - 1)}
            disabled={isAtFirstPage}
            className={getButtonClass(isAtFirstPage)}
          >
            PREV
          </button>

          <button
            type="button"
            onClick={() => navigateToPage(currentPage + 1)}
            disabled={isAtLastPage}
            className={getButtonClass(isAtLastPage)}
          >
            NEXT
          </button>

          <button
            type="button"
            onClick={() => navigateToPage(totalPages)}
            disabled={isAtLastPage}
            className={getButtonClass(isAtLastPage)}
          >
            LAST
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <label htmlFor={`${pathname}-page-input`} className="text-[0.82rem] text-text-muted">
            GO TO
          </label>

          <input
            id={`${pathname}-page-input`}
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            className="w-20 rounded-panel border border-border-input bg-card-bg px-3 py-2 text-[0.9rem] text-text-primary outline-none"
          />

          <button
            type="submit"
            className="cursor-pointer border-none bg-transparent p-0 text-[0.88rem] text-text-primary"
          >
            GO
          </button>
        </form>
      </div>
    </div>
  )
}
