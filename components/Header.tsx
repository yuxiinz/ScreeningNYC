// components/Header.tsx

'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Header() {
  const pathname = usePathname()

  const linkClassName = (path: string) =>
    [
      'border-b-2 pb-[5px] text-[0.9rem] font-medium tracking-normal transition-colors',
      pathname === path
        ? 'border-text-primary text-text-primary'
        : 'border-transparent text-text-dim hover:text-text-primary',
    ].join(' ')

  return (
    <header className="mx-auto mb-10 max-w-[var(--container-wide)] border-b border-border-strong pb-5">
      <h1 className="m-0 text-[2rem] font-extrabold tracking-[-1px]">
        SCREENING NYC
      </h1>

      <nav className="mt-5 flex gap-[30px]">
        <Link href="/" className={linkClassName('/')}>
          FILMS
        </Link>
        <Link href="/date" className={linkClassName('/date')}>
          DATE
        </Link>
        <Link href="/map" className={linkClassName('/map')}>
          MAP
        </Link>
      </nav>
    </header>
  )
}
