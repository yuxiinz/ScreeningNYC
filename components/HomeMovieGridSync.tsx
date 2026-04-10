'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import {
  DEFAULT_HOME_GRID_COLUMNS,
  MAX_HOME_GRID_COLUMNS,
  MIN_HOME_GRID_COLUMNS,
  parseHomeGridColumns,
} from '@/lib/routing/search-params'

const HOME_GRID_MIN_CARD_WIDTH = 220

function clampGridColumns(columns: number) {
  return Math.min(MAX_HOME_GRID_COLUMNS, Math.max(MIN_HOME_GRID_COLUMNS, columns))
}

function countGridColumns(grid: HTMLElement) {
  const styles = window.getComputedStyle(grid)
  const columnGap = Number.parseFloat(styles.columnGap || '0') || 0
  const columns = Math.floor(
    (grid.clientWidth + columnGap) / (HOME_GRID_MIN_CARD_WIDTH + columnGap)
  )

  return clampGridColumns(columns || DEFAULT_HOME_GRID_COLUMNS)
}

export default function HomeMovieGridSync({
  gridId,
}: {
  gridId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()
  const pendingColsRef = useRef<number | null>(null)

  useEffect(() => {
    const grid = document.getElementById(gridId)
    if (!grid) return

    let frameId = 0
    const currentSearchParams = new URLSearchParams(searchParamsString)
    const currentCols = parseHomeGridColumns(currentSearchParams.get('cols') || undefined)

    pendingColsRef.current = null

    const syncColumns = () => {
      cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        const nextCols = countGridColumns(grid)

        if (nextCols === currentCols) {
          pendingColsRef.current = null
          return
        }

        if (pendingColsRef.current === nextCols) {
          return
        }

        pendingColsRef.current = nextCols

        const nextSearchParams = new URLSearchParams(searchParamsString)
        if (nextCols === DEFAULT_HOME_GRID_COLUMNS) {
          nextSearchParams.delete('cols')
        } else {
          nextSearchParams.set('cols', String(nextCols))
        }
        nextSearchParams.delete('page')

        const nextQuery = nextSearchParams.toString()
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
          scroll: false,
        })
      })
    }

    syncColumns()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncColumns)
      return () => {
        cancelAnimationFrame(frameId)
        window.removeEventListener('resize', syncColumns)
      }
    }

    const resizeObserver = new ResizeObserver(syncColumns)
    resizeObserver.observe(grid)

    return () => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
    }
  }, [gridId, pathname, router, searchParamsString])

  return null
}
