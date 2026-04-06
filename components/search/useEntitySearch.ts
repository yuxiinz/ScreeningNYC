'use client'

import { useEffect, useRef, useState } from 'react'

type SearchResultsState<TLocal, TExternal> = {
  localResults: TLocal[]
  externalResults: TExternal[]
}

type UseEntitySearchOptions<TLocal, TExternal> = {
  debounceMs?: number
  getEmptyResults: () => SearchResultsState<TLocal, TExternal>
  getExternalKey?: (item: TExternal) => number | string
  isAuthenticated?: boolean
  minQueryLength?: number
  resolveErrorMessage?: string
  resolveExternal?: (item: TExternal) => Promise<void>
  search: (
    query: string,
    isAuthenticated: boolean
  ) => Promise<SearchResultsState<TLocal, TExternal>>
  searchErrorMessage: string
}

export default function useEntitySearch<TLocal, TExternal>({
  debounceMs = 300,
  getEmptyResults,
  getExternalKey,
  isAuthenticated = false,
  minQueryLength = 2,
  resolveErrorMessage = 'Could not complete this action right now.',
  resolveExternal,
  search,
  searchErrorMessage,
}: UseEntitySearchOptions<TLocal, TExternal>) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultsState<TLocal, TExternal>>(
    getEmptyResults
  )
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [pendingResolveKey, setPendingResolveKey] = useState<number | string | null>(
    null
  )
  const [error, setError] = useState('')

  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useEffect(() => {
    const trimmed = query.trim()

    if (trimmed.length < minQueryLength) {
      setResults(getEmptyResults())
      setLoading(false)
      setOpen(false)
      setError('')
      return
    }

    let active = true

    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')

      try {
        const nextResults = await search(trimmed, isAuthenticated)

        if (!active) {
          return
        }

        setResults(nextResults)
        setOpen(true)
      } catch (nextError) {
        if (!active) {
          return
        }

        console.error('Search request failed:', nextError)
        setResults(getEmptyResults())
        setError(searchErrorMessage)
        setOpen(true)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }, debounceMs)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [
    debounceMs,
    getEmptyResults,
    isAuthenticated,
    minQueryLength,
    query,
    search,
    searchErrorMessage,
  ])

  function clearAndClose() {
    setOpen(false)
    setQuery('')
    setError('')
  }

  function openIfReady() {
    if (query.trim().length >= minQueryLength) {
      setOpen(true)
    }
  }

  async function handleExternalSelect(item: TExternal) {
    if (!resolveExternal || !getExternalKey) {
      return
    }

    const key = getExternalKey(item)

    setPendingResolveKey(key)
    setError('')

    try {
      await resolveExternal(item)
      clearAndClose()
    } catch (nextError) {
      console.error('Resolve request failed:', nextError)
      setError(
        nextError instanceof Error ? nextError.message : resolveErrorMessage
      )
      setOpen(true)
    } finally {
      setPendingResolveKey(null)
    }
  }

  return {
    clearAndClose,
    error,
    handleExternalSelect,
    hasAnyResults:
      results.localResults.length > 0 || results.externalResults.length > 0,
    loading,
    open,
    openIfReady,
    pendingResolveKey,
    query,
    results,
    setQuery,
    wrapperRef,
  }
}
