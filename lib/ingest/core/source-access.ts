// lib/ingest/core/source-access.ts

type BlockedResponse = {
  status?: number
  headers?: Record<string, unknown>
  body?: string
}

const BLOCKED_BODY_PATTERNS = [
  /Just a moment\.\.\./i,
  /Enable JavaScript and cookies to continue/i,
  /Attention Required!/i,
  /cf-browser-verification/i,
]

export function responseLooksBlocked({
  status,
  headers,
  body,
}: BlockedResponse): boolean {
  const cfMitigated = String(headers?.['cf-mitigated'] || '').toLowerCase() === 'challenge'
  const html = typeof body === 'string' ? body : ''

  return (
    status === 403 ||
    cfMitigated ||
    BLOCKED_BODY_PATTERNS.some((pattern) => pattern.test(html))
  )
}

type SourceAccessBlockedErrorOptions = {
  theaterSlug: string
  sourceUrl: string
  status?: number
  detail?: string
}

export class SourceAccessBlockedError extends Error {
  readonly theaterSlug: string
  readonly sourceUrl: string
  readonly status?: number

  constructor({
    theaterSlug,
    sourceUrl,
    status,
    detail,
  }: SourceAccessBlockedErrorOptions) {
    const statusText = status ? ` with status ${status}` : ''
    const detailText = detail ? ` ${detail}` : ''

    super(`[${theaterSlug}] Source blocked request${statusText}: ${sourceUrl}.${detailText}`.trim())

    this.name = 'SourceAccessBlockedError'
    this.theaterSlug = theaterSlug
    this.sourceUrl = sourceUrl
    this.status = status
  }
}

export function isSourceAccessBlockedError(
  error: unknown
): error is SourceAccessBlockedError {
  return error instanceof SourceAccessBlockedError
}
