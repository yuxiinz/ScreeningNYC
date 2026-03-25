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
    <div className="mb-10">
      <input
        type="date"
        value={currentSafeDate}
        onChange={(e) => {
          updateDate(e.target.value)
        }}
        className="cursor-pointer rounded-[4px] border border-border-strong bg-panel-bg px-[15px] py-2.5 text-base text-text-primary outline-none"
      />
    </div>
  )
}
