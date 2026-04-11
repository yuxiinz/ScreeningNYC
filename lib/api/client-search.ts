export type ClientEntitySearchResults<TLocal, TExternal> = {
  localResults: TLocal[]
  externalResults: TExternal[]
}

type ClientEntitySearchConfig<TLocal, TPublicLocal> = {
  authenticatedEndpoint: string
  errorMessage: string
  invalidPayloadLabel: string
  publicEndpoint: string
  transformPublicResults: (results: TPublicLocal[]) => TLocal[]
}

type TmdbClientEntityResolveConfig<TIdKey extends string> = {
  endpoint: string
  errorMessage: string
  idKey: TIdKey
  invalidPayloadErrorMessage: string
}

type TmdbClientEntityRoutesConfig<
  TLocal,
  TPublicLocal,
  TIdKey extends string,
> = {
  resolve: TmdbClientEntityResolveConfig<TIdKey>
  search: ClientEntitySearchConfig<TLocal, TPublicLocal>
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

export function createClientEntitySearch<TLocal, TExternal, TPublicLocal>(
  config: ClientEntitySearchConfig<TLocal, TPublicLocal>
) {
  return async (
    query: string,
    isAuthenticated: boolean
  ): Promise<ClientEntitySearchResults<TLocal, TExternal>> => {
    const endpoint = isAuthenticated
      ? config.authenticatedEndpoint
      : config.publicEndpoint
    const response = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`)

    if (!response.ok) {
      const text = await response.text()
      console.error(`${config.invalidPayloadLabel} returned non OK response:`, text)
      throw new Error(config.errorMessage)
    }

    const data = await response.json()

    if (isAuthenticated) {
      if (isClientEntitySearchResults<TLocal, TExternal>(data)) {
        return data
      }

      console.error(`${config.invalidPayloadLabel} returned invalid payload:`, data)

      return getEmptyClientEntitySearchResults()
    }

    if (Array.isArray(data)) {
      return {
        localResults: config.transformPublicResults(data as TPublicLocal[]),
        externalResults: [],
      }
    }

    console.error(`${config.invalidPayloadLabel} did not return an array:`, data)

    return getEmptyClientEntitySearchResults()
  }
}

function createTmdbClientEntityResolver<TIdKey extends string>(
  config: TmdbClientEntityResolveConfig<TIdKey>
) {
  return async (tmdbId: number) => {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tmdbId }),
    })

    if (!response.ok) {
      throw new Error(config.errorMessage)
    }

    const data = (await response.json()) as Record<string, unknown>
    const resolvedId = data[config.idKey]

    if (typeof resolvedId !== 'number' || !Number.isInteger(resolvedId)) {
      console.error('Resolve API returned invalid payload:', data)
      throw new Error(config.invalidPayloadErrorMessage)
    }

    return resolvedId
  }
}

export function createTmdbClientEntityRoutes<
  TLocal,
  TExternal,
  TPublicLocal,
  TIdKey extends string,
>({
  resolve,
  search,
}: TmdbClientEntityRoutesConfig<TLocal, TPublicLocal, TIdKey>) {
  return {
    resolve: createTmdbClientEntityResolver(resolve),
    search: createClientEntitySearch<TLocal, TExternal, TPublicLocal>(search),
  }
}
