// components/Header.tsx

'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type HeaderProps = {
  accountHref: string
  accountLabel: string
  accountActivePrefixes: string[]
}

export default function Header({
  accountHref,
  accountLabel,
  accountActivePrefixes,
}: HeaderProps) {
  const pathname = usePathname()

  const linkClassName = (path: string, extraPrefixes: string[] = []) =>
    [
      'border-b-2 pb-[5px] text-[0.9rem] font-medium tracking-normal transition-colors',
      pathname === path || extraPrefixes.some(prefix => pathname.startsWith(prefix))
        ? 'border-text-primary text-text-primary'
        : 'border-transparent text-text-dim hover:text-text-primary',
    ].join(' ')

  return (
    <header className="mx-auto mb-10 max-w-[var(--container-wide)] border-b border-border-strong pb-5">
      <h1 className="m-0 text-[2rem] font-extrabold tracking-[-1px]">
        SCREENING NYC
      </h1>

      <nav className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-[30px]">
          <Link href="/" className={linkClassName('/', ['/films/'])}>
            FILMS
          </Link>
          <Link href="/date" className={linkClassName('/date')}>
            DATE
          </Link>
          <Link href="/map" className={linkClassName('/map')}>
            MAP
          </Link>
          <Link
            href="/people"
            className={linkClassName('/people', ['/people/'])}
          >
            DIRECTORS
          </Link>
        </div>

        <Link
          href={accountHref}
          className={linkClassName(accountHref, accountActivePrefixes)}
        >
          {accountLabel}
        </Link>
      </nav>
    </header>
  )
}
