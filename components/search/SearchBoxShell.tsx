'use client'

import type { ReactNode, RefObject } from 'react'

type SearchBoxShellProps = {
  children?: ReactNode
  emptyMessage: string
  error: string
  hasAnyResults: boolean
  loading: boolean
  onFocus: () => void
  onQueryChange: (value: string) => void
  open: boolean
  placeholder: string
  query: string
  wrapperRef: RefObject<HTMLDivElement | null>
}

export default function SearchBoxShell({
  children,
  emptyMessage,
  error,
  hasAnyResults,
  loading,
  onFocus,
  onQueryChange,
  open,
  placeholder,
  query,
  wrapperRef,
}: SearchBoxShellProps) {
  return (
    <div ref={wrapperRef} className="relative w-80">
      <input
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className="box-border w-full rounded-[4px] border border-border-input bg-page-bg px-[14px] py-2.5 text-[0.95rem] text-text-primary outline-none placeholder:text-text-dim"
      />

      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[1000] max-h-[360px] w-full overflow-y-auto rounded-panel border border-border-strong bg-page-bg shadow-popover">
          {loading ? (
            <div className="px-[14px] py-3 text-[0.9rem] text-text-muted">
              Searching...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="px-[14px] py-3 text-[0.9rem] text-status-error">
              {error}
            </div>
          ) : null}

          {!loading && !error && !hasAnyResults ? (
            <div className="px-[14px] py-3 text-[0.9rem] text-text-disabled">
              {emptyMessage}
            </div>
          ) : null}

          {children}
        </div>
      ) : null}
    </div>
  )
}
