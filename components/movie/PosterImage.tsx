'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from 'react'

type PosterImageProps = {
  src: string
  alt: string
  className?: string
}

const ANTHOLOGY_FALLBACK_MARKUP = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" role="img" aria-label="Anthology fallback poster">
  <rect width="800" height="1200" fill="#f3eadb"/>
  <rect x="48" y="48" width="704" height="1104" fill="none" stroke="#111111" stroke-width="8"/>
  <rect x="92" y="92" width="616" height="196" fill="#111111"/>
  <text x="400" y="168" fill="#f3eadb" font-size="58" font-family="Georgia, serif" text-anchor="middle" letter-spacing="4">ANTHOLOGY</text>
  <text x="400" y="232" fill="#f3eadb" font-size="34" font-family="Courier New, monospace" text-anchor="middle" letter-spacing="7">FILM ARCHIVES</text>
  <rect x="92" y="350" width="616" height="28" fill="#9e3028"/>
  <text x="400" y="512" fill="#111111" font-size="74" font-family="Georgia, serif" text-anchor="middle" letter-spacing="6">SCREENING</text>
  <text x="400" y="602" fill="#111111" font-size="74" font-family="Georgia, serif" text-anchor="middle" letter-spacing="6">PLACEHOLDER</text>
  <text x="400" y="716" fill="#111111" font-size="24" font-family="Courier New, monospace" text-anchor="middle" letter-spacing="5">USED WHEN NO POSTER IS AVAILABLE</text>
  <circle cx="400" cy="870" r="118" fill="none" stroke="#111111" stroke-width="10"/>
  <circle cx="400" cy="870" r="18" fill="#111111"/>
  <path d="M400 762 L400 978 M292 870 L508 870" stroke="#111111" stroke-width="10"/>
  <text x="400" y="1086" fill="#111111" font-size="26" font-family="Courier New, monospace" text-anchor="middle" letter-spacing="4">32 SECOND AVENUE, NEW YORK</text>
</svg>
`.trim()

const DEFAULT_FALLBACK_MARKUP = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" role="img" aria-label="Poster fallback">
  <rect width="800" height="1200" fill="#e7ecef"/>
  <rect x="52" y="52" width="696" height="1096" fill="none" stroke="#1b1e21" stroke-width="8"/>
  <rect x="112" y="128" width="576" height="404" rx="18" fill="#1b1e21"/>
  <circle cx="270" cy="262" r="54" fill="#c8d0d7"/>
  <path d="M168 470 L314 322 L402 406 L498 286 L632 470 Z" fill="#c8d0d7"/>
  <text x="400" y="706" fill="#1b1e21" font-size="70" font-family="Georgia, serif" text-anchor="middle" letter-spacing="6">NO POSTER</text>
  <text x="400" y="790" fill="#1b1e21" font-size="34" font-family="Courier New, monospace" text-anchor="middle" letter-spacing="5">IMAGE UNAVAILABLE</text>
  <text x="400" y="1034" fill="#1b1e21" font-size="24" font-family="Courier New, monospace" text-anchor="middle" letter-spacing="4">FALLBACK ARTWORK</text>
</svg>
`.trim()

const ANTHOLOGY_FALLBACK_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  ANTHOLOGY_FALLBACK_MARKUP
)}`
const DEFAULT_FALLBACK_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  DEFAULT_FALLBACK_MARKUP
)}`

function normalizeSrc(src: string) {
  if (src.includes('/anthology-fallback-poster.svg')) {
    return ANTHOLOGY_FALLBACK_SRC
  }

  if (src.includes('/poster-fallback.svg')) {
    return DEFAULT_FALLBACK_SRC
  }

  return src
}

function getFallbackSrc(src: string) {
  if (
    src.includes('anthologyfilmarchives.org') ||
    src.includes('ticketing.uswest.veezi.com') ||
    src.includes('/anthology-fallback-poster.svg') ||
    src === ANTHOLOGY_FALLBACK_SRC
  ) {
    return ANTHOLOGY_FALLBACK_SRC
  }

  return DEFAULT_FALLBACK_SRC
}

export default function PosterImage({
  src,
  alt,
  className,
}: PosterImageProps) {
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

    const fallbackSrc = getFallbackSrc(currentSrc)
    if (currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc)
    }
  }, [currentSrc])

  // Poster URLs come from TMDB and theater sites at runtime, so keep native img
  // until the project defines a strict next/image remote host allowlist.
  return (
    <img
      ref={imageRef}
      src={currentSrc}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        const fallbackSrc = getFallbackSrc(currentSrc)
        if (currentSrc !== fallbackSrc) {
          setCurrentSrc(fallbackSrc)
        }
      }}
    />
  )
}
