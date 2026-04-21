import test from 'node:test'
import assert from 'node:assert/strict'

let matchModule: typeof import('../lib/movie/match') | null = null
let canonicalLookupModule: typeof import('../lib/movie/canonical-lookup') | null = null
let persistServiceModule: typeof import('../lib/ingest/services/persist_service') | null = null
let normalizeModule: typeof import('@/lib/movie/normalize') | null = null

async function loadMatchModule() {
  process.env.DATABASE_URL ||= 'postgresql://localhost:5432/screeningnyc-test'

  if (!matchModule) {
    matchModule = await import('../lib/movie/match')
  }

  return matchModule
}

async function loadCanonicalLookupModule() {
  process.env.DATABASE_URL ||= 'postgresql://localhost:5432/screeningnyc-test'

  if (!canonicalLookupModule) {
    canonicalLookupModule = await import('../lib/movie/canonical-lookup')
  }

  return canonicalLookupModule
}

async function loadPersistServiceModule() {
  process.env.DATABASE_URL ||= 'postgresql://localhost:5432/screeningnyc-test'

  if (!persistServiceModule) {
    persistServiceModule = await import('../lib/ingest/services/persist_service')
  }

  return persistServiceModule
}

async function loadNormalizeModule() {
  process.env.DATABASE_URL ||= 'postgresql://localhost:5432/screeningnyc-test'

  if (!normalizeModule) {
    normalizeModule = await import('@/lib/movie/normalize')
  }

  return normalizeModule
}

test('normalizeMovieName removes diacritic differences', async () => {
  const { normalizeMovieName } = await loadNormalizeModule()  
  assert.equal(normalizeMovieName('Sirât'), normalizeMovieName('Sirāt'))
})

test('normalizeMovieName strips event suffixes and curatorial prefixes', async () => {
  const { normalizeMovieName } = await loadNormalizeModule()  

  assert.equal(
    normalizeMovieName('MOTHER MARY: Q&A with Filmmaker David Lowery'),
    normalizeMovieName('Mother Mary')
  )
  assert.equal(
    normalizeMovieName('Roxy Presents: Mother Mary'),
    normalizeMovieName('Mother Mary')
  )
})

test('findLocalMovieByImportMatch falls back to normalized title equality', async () => {
  const { findLocalMovieByImportMatch } = await loadMatchModule()
  const candidateMovie = {
    id: 349,
    title: 'Sirāt',
    originalTitle: 'Sirāt',
    directorText: 'Oliver Laxe',
    releaseDate: new Date('2025-01-01T00:00:00.000Z'),
    tmdbId: 1151272,
    posterUrl: 'https://image.tmdb.org/t/p/w500/example.jpg',
  }

  let findManyCalls = 0

  const db = {
    movie: {
      findUnique: async () => null,
      findFirst: async () => null,
      findMany: async () => {
        findManyCalls += 1

        if (findManyCalls < 3) {
          return []
        }

        return [candidateMovie]
      },
    },
  }

  const match = await findLocalMovieByImportMatch(
    {
      title: 'Sirât',
      directorText: 'Oliver Laxe',
      releaseYear: 2025,
    },
    db as never
  )

  assert.equal(match?.id, 349)
})

test('shouldAttemptCanonicalTmdbLookup retries when a matched local movie lacks canonical metadata', async () => {
  const { shouldAttemptCanonicalTmdbLookup } = await loadCanonicalLookupModule()

  const shouldRetry = shouldAttemptCanonicalTmdbLookup(
    {
      tmdbId: null,
      imdbUrl: null,
      directorText: 'Gordon Parks',
      originalTitle: null,
      posterUrl: 'https://www.bam.org/globalassets/programs/cinema/2026fy/0426/example.jpg',
    },
    {
      title: "Solomon Northup's Odyssey",
      directorText: 'Gordon Parks',
      releaseYear: 1984,
    }
  )

  assert.equal(shouldRetry, true)
})

test('findLocalMovieByImportMatch tolerates one-year release differences', async () => {
  const { findLocalMovieByImportMatch } = await loadMatchModule()

  const candidateMovie = {
    id: 2422,
    title: 'Palestine 36',
    originalTitle: 'Palestine 36',
    directorText: 'Annemarie Jacir',
    releaseDate: new Date('2026-01-01T00:00:00.000Z'),
    tmdbId: 1432596,
    posterUrl: 'https://image.tmdb.org/t/p/w500/example.jpg',
  }

  let findManyCalls = 0

  const db = {
    movie: {
      findUnique: async () => null,
      findFirst: async () => null,
      findMany: async () => {
        findManyCalls += 1

        if (findManyCalls === 1) {
          return [candidateMovie]
        }

        return []
      },
    },
  }

  const match = await findLocalMovieByImportMatch(
    {
      title: "Palestine '36",
      directorText: 'Annemarie Jacir',
      releaseYear: 2025,
    },
    db as never
  )

  assert.equal(match?.id, 2422)
})

test('findLocalMovieByImportMatch prefers canonical tmdb movie over exact local duplicate', async () => {
  const { findLocalMovieByImportMatch } = await loadMatchModule()

  const localDuplicate = {
    id: 48090,
    title: "Palestine '36",
    originalTitle: null,
    directorText: 'Annemarie Jacir',
    releaseDate: new Date('2025-01-01T00:00:00.000Z'),
    tmdbId: null,
    posterUrl: 'https://www.bam.org/globalassets/programs/cinema/2026fy/0326/p36.jpg',
  }

  const canonicalMovie = {
    id: 2422,
    title: 'Palestine 36',
    originalTitle: 'Palestine 36',
    directorText: 'Annemarie Jacir',
    releaseDate: new Date('2025-10-31T00:00:00.000Z'),
    tmdbId: 1432596,
    posterUrl: 'https://image.tmdb.org/t/p/w500/example.jpg',
  }

  let findManyCalls = 0

  const db = {
    movie: {
      findUnique: async () => null,
      findFirst: async () => null,
      findMany: async () => {
        findManyCalls += 1

        if (findManyCalls === 1) {
          return [localDuplicate]
        }

        if (findManyCalls === 2) {
          return [canonicalMovie]
        }

        return []
      },
    },
  }

  const match = await findLocalMovieByImportMatch(
    {
      title: "Palestine '36",
      directorText: 'Annemarie Jacir',
      releaseYear: 2025,
    },
    db as never
  )

  assert.equal(match?.id, 2422)
})

test('chooseMergedReleaseDate prefers tmdb dates over local year-only placeholders', async () => {
  const { chooseMergedReleaseDate } = await loadPersistServiceModule()

  const result = chooseMergedReleaseDate({
    existing: {
      tmdbId: null,
      releaseDate: new Date('2026-01-01T00:00:00.000Z'),
    },
    tmdb: {
      tmdbId: 1432596,
      title: 'Palestine 36',
      releaseDate: new Date('2025-10-31T00:00:00.000Z'),
    },
    fallbackReleaseDate: new Date('2026-01-01T00:00:00.000Z'),
  })

  assert.equal(result?.toISOString(), '2025-10-31T00:00:00.000Z')
})
