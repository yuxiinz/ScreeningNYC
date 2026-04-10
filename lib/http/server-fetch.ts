type QueryParamPrimitive = string | number | boolean

type QueryParamValue =
  | QueryParamPrimitive
  | null
  | undefined
  | readonly QueryParamPrimitive[]

type QueryParams = Record<string, QueryParamValue>

type ServerFetchOptions = Omit<RequestInit, 'body' | 'cache' | 'headers' | 'signal'> & {
  body?: BodyInit | null
  cache?: RequestCache
  headers?: HeadersInit
  jsonBody?: unknown
  params?: QueryParams
  timeout?: number
  validateStatus?: (status: number) => boolean
}

export type ServerFetchResponse<T> = {
  data: T
  headers: Headers
  setCookie: string[]
  status: number
  url: string
}

type ParseMode = 'json' | 'text'

type HttpErrorOptions = {
  bodyText: string
  headers: Headers
  status: number
  statusText: string
  url: string
}

export class HttpError extends Error {
  readonly bodyText: string
  readonly headers: Headers
  readonly status: number
  readonly statusText: string
  readonly url: string

  constructor({ bodyText, headers, status, statusText, url }: HttpErrorOptions) {
    super(`HTTP request failed: ${status} ${statusText} ${url}`.trim())
    this.name = 'HttpError'
    this.bodyText = bodyText
    this.headers = headers
    this.status = status
    this.statusText = statusText
    this.url = url
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError
}

function isSuccessStatus(status: number) {
  return status >= 200 && status < 300
}

function buildUrl(input: string, params?: QueryParams): string {
  if (!params) {
    return input
  }

  const url = new URL(input)

  for (const [key, value] of Object.entries(params)) {
    if (value == null) {
      continue
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry == null) continue
        url.searchParams.append(key, String(entry))
      }
      continue
    }

    url.searchParams.append(key, String(value))
  }

  return url.toString()
}

function getSetCookie(headers: Headers): string[] {
  const cookieHeaders = (
    headers as Headers & {
      getSetCookie?: () => string[]
    }
  ).getSetCookie

  if (typeof cookieHeaders === 'function') {
    return cookieHeaders.call(headers)
  }

  const combined = headers.get('set-cookie')
  return combined ? [combined] : []
}

function createTimeoutSignal(timeout?: number) {
  const controller = new AbortController()

  if (!timeout || timeout <= 0) {
    return {
      clear: () => {},
      signal: controller.signal,
      timedOut: () => false,
    }
  }

  let didTimeout = false
  const timer = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeout)

  return {
    clear: () => clearTimeout(timer),
    signal: controller.signal,
    timedOut: () => didTimeout,
  }
}

async function parseResponseBody<T>(response: Response, mode: ParseMode): Promise<T> {
  if (mode === 'text') {
    return await response.text() as T
  }

  const text = await response.text()
  return (text ? JSON.parse(text) : null) as T
}

async function request<T>(
  input: string,
  mode: ParseMode,
  {
    body,
    cache = 'no-store',
    headers,
    jsonBody,
    method,
    params,
    timeout,
    validateStatus = isSuccessStatus,
    ...init
  }: ServerFetchOptions = {}
): Promise<ServerFetchResponse<T>> {
  if (body !== undefined && jsonBody !== undefined) {
    throw new Error('Use either `body` or `jsonBody`, not both.')
  }

  const url = buildUrl(input, params)
  const requestHeaders = new Headers(headers)

  let requestBody = body
  if (jsonBody !== undefined) {
    if (!requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json')
    }

    requestBody = JSON.stringify(jsonBody)
  }

  const timeoutSignal = createTimeoutSignal(timeout)

  try {
    const response = await fetch(url, {
      ...init,
      body: requestBody,
      cache,
      headers: requestHeaders,
      method: method || (requestBody === undefined ? 'GET' : 'POST'),
      signal: timeoutSignal.signal,
    })

    if (!validateStatus(response.status)) {
      throw new HttpError({
        bodyText: await response.text(),
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
        url,
      })
    }

    return {
      data: await parseResponseBody<T>(response, mode),
      headers: response.headers,
      setCookie: getSetCookie(response.headers),
      status: response.status,
      url: response.url || url,
    }
  } catch (error) {
    if (timeoutSignal.timedOut()) {
      throw new Error(`HTTP request timed out after ${timeout}ms: ${url}`)
    }

    throw error
  } finally {
    timeoutSignal.clear()
  }
}

export async function fetchJson<T>(
  input: string,
  options?: ServerFetchOptions
): Promise<ServerFetchResponse<T>> {
  return request<T>(input, 'json', options)
}

export async function fetchText(
  input: string,
  options?: ServerFetchOptions
): Promise<ServerFetchResponse<string>> {
  return request<string>(input, 'text', options)
}
