export type ClientEntitySearchResults<TLocal, TExternal> = {
  localResults: TLocal[]
  externalResults: TExternal[]
}

type SearchRouteOptions<TLocal, TPublicLocal> = {
  authenticatedEndpoint: string
  errorMessage: string
  invalidPayloadLabel: string
  isAuthenticated: boolean
  publicEndpoint: string
  query: string
  transformPublicResults: (results: TPublicLocal[]) => TLocal[]
}

type ResolveEntityRouteOptions<TBody, TIdKey extends string> = {
  body: TBody
  endpoint: string
  errorMessage: string
  idKey: TIdKey
  invalidPayloadErrorMessage: string
}

export function getEmptyClientEntitySearchResults<TLocal, TExternal>(): ClientEntitySearchResults<
  TLocal,
  TExternal
> {
  return {
    localResults: [],
    externalResults: [],
  }
}

function isClientEntitySearchResults<TLocal, TExternal>(
  value: unknown
): value is ClientEntitySearchResults<TLocal, TExternal> {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as {
    externalResults?: unknown
    localResults?: unknown
  }

  return (
    Array.isArray(candidate.localResults) &&
    Array.isArray(candidate.externalResults)
  )
}

export async function searchClientEntityRoute<TLocal, TExternal, TPublicLocal>({
  authenticatedEndpoint,
  errorMessage,
  invalidPayloadLabel,
  isAuthenticated,
  publicEndpoint,
  query,
  transformPublicResults,
}: SearchRouteOptions<TLocal, TPublicLocal>): Promise<
  ClientEntitySearchResults<TLocal, TExternal>
> {
  const endpoint = isAuthenticated
    ? authenticatedEndpoint
    : publicEndpoint
  const response = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`)

  if (!response.ok) {
    const text = await response.text()
    console.error(`${invalidPayloadLabel} returned non OK response:`, text)
    throw new Error(errorMessage)
  }

  const data = await response.json()

  if (isAuthenticated) {
    if (isClientEntitySearchResults<TLocal, TExternal>(data)) {
      return data
    }

    console.error(`${invalidPayloadLabel} returned invalid payload:`, data)

    return getEmptyClientEntitySearchResults()
  }

  if (Array.isArray(data)) {
    return {
      localResults: transformPublicResults(data as TPublicLocal[]),
      externalResults: [],
    }
  }

  console.error(`${invalidPayloadLabel} did not return an array:`, data)

  return getEmptyClientEntitySearchResults()
}

export async function resolveClientEntityRoute<TBody, TIdKey extends string>({
  body,
  endpoint,
  errorMessage,
  idKey,
  invalidPayloadErrorMessage,
}: ResolveEntityRouteOptions<TBody, TIdKey>): Promise<number> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(errorMessage)
  }

  const data = (await response.json()) as Record<string, unknown>
  const resolvedId = data[idKey]

  if (typeof resolvedId !== 'number' || !Number.isInteger(resolvedId)) {
    console.error('Resolve API returned invalid payload:', data)
    throw new Error(invalidPayloadErrorMessage)
  }

  return resolvedId
}
