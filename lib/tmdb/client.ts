export class TmdbApiKeyMissingError extends Error {
  constructor(message = 'TMDB_API_KEY is not configured.') {
    super(message)
    this.name = 'TmdbApiKeyMissingError'
  }
}

export function getTmdbApiKey() {
  const apiKey = process.env.TMDB_API_KEY?.trim()

  if (!apiKey) {
    throw new TmdbApiKeyMissingError()
  }

  return apiKey
}

export function buildTmdbImageUrl(
  path: string | null | undefined,
  size: string
) {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null
}
