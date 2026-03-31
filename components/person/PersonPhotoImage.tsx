'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from 'react'

type PersonPhotoImageProps = {
  src: string
  alt: string
  className?: string
}

const DEFAULT_FALLBACK_MARKUP = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" role="img" aria-label="Director photo fallback">
  <rect width="800" height="1000" fill="#ece7df"/>
  <rect x="48" y="48" width="704" height="904" fill="none" stroke="#141414" stroke-width="8"/>
  <circle cx="400" cy="332" r="138" fill="#d0c7ba"/>
  <path d="M182 760 C182 612 286 520 400 520 C514 520 618 612 618 760 L618 860 L182 860 Z" fill="#d0c7ba"/>
  <text x="400" y="920" fill="#141414" font-size="34" font-family="Courier New, monospace" text-anchor="middle" letter-spacing="5">NO PHOTO</text>
</svg>
`.trim()

const DEFAULT_FALLBACK_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  DEFAULT_FALLBACK_MARKUP
)}`

function normalizeSrc(src: string) {
  return src || DEFAULT_FALLBACK_SRC
}

export default function PersonPhotoImage({
  src,
  alt,
  className,
}: PersonPhotoImageProps) {
  const [currentSrc, setCurrentSrc] = useState(() => normalizeSrc(src))
  const imageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    setCurrentSrc(normalizeSrc(src))
  }, [src])

  useEffect(() => {
    const image = imageRef.current
    if (!image || !image.complete || image.naturalWidth > 0) {
      return
    }

    if (currentSrc !== DEFAULT_FALLBACK_SRC) {
      setCurrentSrc(DEFAULT_FALLBACK_SRC)
    }
  }, [currentSrc])

  return (
    <img
      ref={imageRef}
      src={currentSrc}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (currentSrc !== DEFAULT_FALLBACK_SRC) {
          setCurrentSrc(DEFAULT_FALLBACK_SRC)
        }
      }}
    />
  )
}
