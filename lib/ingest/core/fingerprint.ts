import crypto from 'crypto'
import { canonicalizeTitle } from './screening-title'

export function buildFingerprint(params: {
  theaterSlug: string
  movieTitle: string
  startTimeUtcIso: string
  formatName: string
}): string {
  const raw = [
    params.theaterSlug.toLowerCase(),
    canonicalizeTitle(params.movieTitle).toLowerCase(),
    params.startTimeUtcIso,
    params.formatName.toLowerCase(),
  ].join('|')

  return crypto.createHash('sha256').update(raw).digest('hex')
}
