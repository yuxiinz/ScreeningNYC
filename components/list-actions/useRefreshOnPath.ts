'use client'

import { usePathname, useRouter } from 'next/navigation'

export function useRefreshOnPath(path: string) {
  const router = useRouter()
  const pathname = usePathname()

  return () => {
    if (pathname === path) {
      router.refresh()
    }
  }
}
