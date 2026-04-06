import type { ReactNode } from 'react'
import Link from 'next/link'

import {
  cleanDirectorText,
  getReleaseYear,
} from '@/lib/movie/display'

import PosterImage from './PosterImage'

const POSTER_CARD_CLASS =
  'mb-3 flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-card border border-border-subtle bg-card-bg shadow-card'
const TITLE_CLASS =
  'mb-2 min-h-[2.5em] overflow-hidden text-[0.95rem] font-bold leading-[1.25] uppercase [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]'
const SECONDARY_CLASS =
  'mb-1 min-h-[1.35em] overflow-hidden text-[0.78rem] leading-[1.35] text-text-tertiary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1]'

type MovieGridCardProps = {
  href: string
  title: string
  posterUrl?: string | null
  directorText?: string | null
  secondaryText?: string
  releaseDate?: Date | null
  year?: number | null
  prefetch?: boolean
  children?: ReactNode
}

export default function MovieGridCard({
  href,
  title,
  posterUrl,
  directorText,
  secondaryText,
  releaseDate,
  year,
  prefetch,
  children,
}: MovieGridCardProps) {
  const displayYear =
    typeof year === 'number' ? year : getReleaseYear(releaseDate)
  const displaySecondaryText =
    typeof secondaryText === 'string'
      ? secondaryText
      : cleanDirectorText(directorText, 'UNKNOWN DIRECTOR')

  return (
    <article className="flex flex-col">
      <Link
        href={href}
        prefetch={prefetch}
        className="block text-inherit no-underline"
      >
        <div className={POSTER_CARD_CLASS}>
          {posterUrl ? (
            <PosterImage src={posterUrl} alt={title} />
          ) : (
            <div className="text-[0.9rem] text-text-empty">No Poster</div>
          )}
        </div>

        <div className="px-0.5">
          <h3 className={TITLE_CLASS}>{title}</h3>

          <p className={SECONDARY_CLASS}>{displaySecondaryText}</p>

          <p className="m-0 min-h-[1.35em] text-[0.76rem] leading-[1.35] text-text-soft">
            {displayYear ?? ''}
          </p>
        </div>
      </Link>

      {children}
    </article>
  )
}
