// components/Header.tsx

'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Header() {
  const pathname = usePathname()

  const linkStyle = (path: string) => ({
    color: pathname === path ? '#fff' : '#888',
    borderBottom: pathname === path ? '2px solid #fff' : 'none',
    paddingBottom: '5px',
    textDecoration: 'none',
  })

  return (
    <header
      style={{
        maxWidth: '1600px',
        margin: '0 auto 40px',
        borderBottom: '1px solid #333',
        paddingBottom: '20px',
      }}
    >
      <h1
        style={{
          fontSize: '2rem',
          fontWeight: '800',
          letterSpacing: '-1px',
          margin: 0,
        }}
      >
        SCREENING NYC
      </h1>

      <nav
        style={{
          display: 'flex',
          gap: '30px',
          marginTop: '20px',
          fontSize: '0.9rem',
          fontWeight: '500',
        }}
      >
        <Link href="/" style={linkStyle('/')}>
          FILMS
        </Link>
        <Link href="/date" style={linkStyle('/date')}>
          DATE
        </Link>
        <Link href="/map" style={linkStyle('/map')}>
          MAP
        </Link>
      </nav>
    </header>
  )
}