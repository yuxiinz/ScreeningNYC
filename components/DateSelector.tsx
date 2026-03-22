'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export default function DateSelector({
  currentSafeDate,
}: {
  currentSafeDate: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function updateDate(nextDate: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('date', nextDate)

    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div style={{ marginBottom: '40px' }}>
      <input
        type="date"
        value={currentSafeDate}
        onChange={(e) => {
          updateDate(e.target.value)
        }}
        style={{
          backgroundColor: '#1a1a1a',
          color: '#fff',
          border: '1px solid #333',
          padding: '10px 15px',
          borderRadius: '4px',
          fontSize: '1rem',
          outline: 'none',
          cursor: 'pointer'
        }}
      />
    </div>
  )
}