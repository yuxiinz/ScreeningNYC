type PosterImageProps = {
  src: string
  alt: string
  className?: string
}

export default function PosterImage({
  src,
  alt,
  className,
}: PosterImageProps) {
  // Poster URLs come from TMDB and theater sites at runtime, so keep native img
  // until the project defines a strict next/image remote host allowlist.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />
}
