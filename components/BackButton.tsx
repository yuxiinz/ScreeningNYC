// components/BackButton.tsx

'use client'

import { useRouter } from 'next/navigation'

export default function BackButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.back()}
      style={{
        background: 'none',
        border: 'none',
        color: '#ffffff',
        fontSize: '1rem',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      ← BACK
    </button>
  )
}