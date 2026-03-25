type MovieExternalLinksProps = {
  imdbUrl?: string | null
  doubanUrl?: string | null
  letterboxdUrl?: string | null
  size?: 'sm' | 'md'
  showExternalIndicator?: boolean
  className?: string
}

type ExternalLink = {
  href: string
  label: string
  className: string
}

const LINK_CLASSES = {
  imdb: 'border-accent-imdb text-accent-imdb',
  douban: 'border-accent-douban text-accent-douban',
  letterboxd: 'border-accent-letterboxd text-accent-letterboxd',
} as const

function renderLabel(label: string, showExternalIndicator: boolean): string {
  return showExternalIndicator ? `${label} ↗` : label
}

function buildLinkClass(
  colorClassName: string,
  size: 'sm' | 'md'
): string {
  const sizeClassName =
    size === 'sm'
      ? 'min-w-[38px] rounded-[4px] px-2 py-[3px]'
      : 'rounded-panel px-2.5 py-1.5'

  return [
    'inline-flex items-center justify-center border no-underline transition-opacity hover:opacity-100',
    sizeClassName,
    colorClassName,
  ].join(' ')
}

export default function MovieExternalLinks({
  imdbUrl,
  doubanUrl,
  letterboxdUrl,
  size = 'sm',
  showExternalIndicator = false,
  className,
}: MovieExternalLinksProps) {
  const links: ExternalLink[] = [
    imdbUrl
      ? {
          href: imdbUrl,
          label: renderLabel('IMDb', showExternalIndicator),
          className: buildLinkClass(LINK_CLASSES.imdb, size),
        }
      : null,
    doubanUrl
      ? {
          href: doubanUrl,
          label: renderLabel('豆瓣', showExternalIndicator),
          className: buildLinkClass(LINK_CLASSES.douban, size),
        }
      : null,
    letterboxdUrl
      ? {
          href: letterboxdUrl,
          label: renderLabel('LB', showExternalIndicator),
          className: buildLinkClass(LINK_CLASSES.letterboxd, size),
        }
      : null,
  ].filter((link): link is ExternalLink => link !== null)

  if (links.length === 0) return null

  return (
    <div
      className={[
        'flex flex-wrap',
        size === 'sm' ? 'gap-2' : 'gap-3',
        className ?? '',
      ].join(' ')}
    >
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={link.className}
        >
          {link.label}
        </a>
      ))}
    </div>
  )
}
