'use client'

import type { ReactNode } from 'react'

import SearchBoxShell from '@/components/search/SearchBoxShell'
import SearchResultButton from '@/components/search/SearchResultButton'
import useEntitySearch from '@/components/search/useEntitySearch'
import type { ClientEntitySearchResults } from '@/lib/api/client-search'

type EntitySearchBoxProps<TLocal, TExternal> = {
  emptyMessage: string
  externalDisabledClassName?: string
  getExternalKey?: (item: TExternal) => number | string
  getLocalDisabled?: (item: TLocal) => boolean
  getLocalKey: (item: TLocal) => number | string
  isAuthenticated?: boolean
  localDisabledClassName?: string
  onLocalSelect: (item: TLocal) => void
  placeholder: string
  renderExternalResult?: (item: TExternal, isPending: boolean) => ReactNode
  renderLocalResult: (item: TLocal) => ReactNode
  resolveExternal?: (item: TExternal) => Promise<void>
  search: (
    query: string,
    isAuthenticated: boolean
  ) => Promise<ClientEntitySearchResults<TLocal, TExternal>>
}

export default function EntitySearchBox<TLocal, TExternal>({
  emptyMessage,
  externalDisabledClassName,
  getExternalKey,
  getLocalDisabled,
  getLocalKey,
  isAuthenticated = false,
  localDisabledClassName,
  onLocalSelect,
  placeholder,
  renderExternalResult,
  renderLocalResult,
  resolveExternal,
  search,
}: EntitySearchBoxProps<TLocal, TExternal>) {
  const {
    clearAndClose,
    error,
    handleExternalSelect,
    hasAnyResults,
    loading,
    open,
    openIfReady,
    pendingResolveKey,
    query,
    results,
    setQuery,
    wrapperRef,
  } = useEntitySearch<TLocal, TExternal>({
    getExternalKey,
    isAuthenticated,
    resolveExternal,
    search,
  })

  return (
    <SearchBoxShell
      wrapperRef={wrapperRef}
      query={query}
      onQueryChange={setQuery}
      onFocus={openIfReady}
      placeholder={placeholder}
      open={open}
      loading={loading}
      error={error}
      hasAnyResults={hasAnyResults}
      emptyMessage={emptyMessage}
    >
      {!loading &&
        results.localResults.map((item, index) => {
          const isDisabled = Boolean(getLocalDisabled?.(item))

          return (
            <SearchResultButton
              key={getLocalKey(item)}
              disabled={isDisabled}
              disabledClassName={localDisabledClassName}
              onClick={() => {
                if (isDisabled) {
                  return
                }

                clearAndClose()
                onLocalSelect(item)
              }}
              isLast={
                index === results.localResults.length - 1 &&
                results.externalResults.length === 0
              }
            >
              {renderLocalResult(item)}
            </SearchResultButton>
          )
        })}

      {!loading &&
        renderExternalResult &&
        getExternalKey &&
        results.externalResults.map((item, index) => {
          const key = getExternalKey(item)
          const isPending = pendingResolveKey === key

          return (
            <SearchResultButton
              key={key}
              disabled={pendingResolveKey !== null}
              disabledClassName={externalDisabledClassName}
              onClick={() => {
                if (pendingResolveKey === null) {
                  void handleExternalSelect(item)
                }
              }}
              isLast={index === results.externalResults.length - 1}
            >
              {renderExternalResult(item, isPending)}
            </SearchResultButton>
          )
        })}
    </SearchBoxShell>
  )
}
