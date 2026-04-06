'use client'

import { useEffect, useState } from 'react'

const VISIBILITY_SCROLL_Y = 480

export default function BackToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function updateVisibility() {
      setVisible(window.scrollY > VISIBILITY_SCROLL_Y)
    }

    updateVisibility()
    window.addEventListener('scroll', updateVisibility, { passive: true })

    return () => {
      window.removeEventListener('scroll', updateVisibility)
    }
  }, [])

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={[
        'fixed bottom-6 right-5 z-40 cursor-pointer rounded-full border border-border-default bg-card-bg px-4 py-3 text-[0.76rem] font-bold tracking-[0.08em] text-text-primary shadow-card transition-all duration-200 hover:border-text-primary',
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0',
      ].join(' ')}
    >
      TOP
    </button>
  )
}
