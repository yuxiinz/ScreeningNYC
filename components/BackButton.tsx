// components/BackButton.tsx

'use client'

import { useRouter } from 'next/navigation'

type BackButtonProps = {
  fallbackHref?: string
}

function hasBrowserHistory() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.history.length > 1
}

export default function BackButton({
  fallbackHref = '/',
}: BackButtonProps) {
  const router = useRouter()

  return (
    <button
      onClick={() => {
        if (hasBrowserHistory()) {
          router.back()
          return
        }

        router.push(fallbackHref)
      }}
      className="cursor-pointer border-none bg-transparent p-0 text-base text-text-primary"
    >
      ← BACK
    </button>
  )
}
