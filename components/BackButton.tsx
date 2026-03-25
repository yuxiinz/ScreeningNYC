// components/BackButton.tsx

'use client'

import { useRouter } from 'next/navigation'

export default function BackButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.back()}
      className="cursor-pointer border-none bg-transparent p-0 text-base text-text-primary"
    >
      ← BACK
    </button>
  )
}
