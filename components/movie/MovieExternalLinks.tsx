import type { CSSProperties } from 'react'

type MovieExternalLinksProps = {
  imdbUrl?: string | null
  doubanUrl?: string | null
  letterboxdUrl?: string | null
  size?: 'sm' | 'md'
  showExternalIndicator?: boolean
  style?: CSSProperties
}

type ExternalLink = {
  href: string
  label: string
  style: CSSProperties
}

const COLORS = {
  imdb: '#f5c518',
  douban: '#00b51d',
  letterboxd: '#ff8000',
} as const

function buildLinkStyle(
  color: string,
  size: 'sm' | 'md'
): CSSProperties {
  if (size === 'sm') {
    return {
      color,
      textDecoration: 'none',
      border: `1px solid ${color}`,
      padding: '3px 8px',
      borderRadius: '4px',
      minWidth: '38px',
      textAlign: 'center',
    }
  }

  return {
    color,
    textDecoration: 'none',
    border: `1px solid ${color}`,
    padding: '6px 10px',
    borderRadius: '6px',
  }
}

function renderLabel(label: string, showExternalIndicator: boolean): string {
  return showExternalIndicator ? `${label} ↗` : label
}

export default function MovieExternalLinks({
  imdbUrl,
  doubanUrl,
  letterboxdUrl,
  size = 'sm',
  showExternalIndicator = false,
  style,
}: MovieExternalLinksProps) {
  const links: ExternalLink[] = [
    imdbUrl
      ? {
          href: imdbUrl,
          label: renderLabel('IMDb', showExternalIndicator),
          style: buildLinkStyle(COLORS.imdb, size),
        }
      : null,
    doubanUrl
      ? {
          href: doubanUrl,
          label: renderLabel('豆瓣', showExternalIndicator),
          style: buildLinkStyle(COLORS.douban, size),
        }
      : null,
    letterboxdUrl
      ? {
          href: letterboxdUrl,
          label: renderLabel('LB', showExternalIndicator),
          style: buildLinkStyle(COLORS.letterboxd, size),
        }
      : null,
  ].filter((link): link is ExternalLink => link !== null)

  if (links.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: size === 'sm' ? '8px' : '12px',
        ...style,
      }}
    >
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          style={link.style}
        >
          {link.label}
        </a>
      ))}
    </div>
  )
}
