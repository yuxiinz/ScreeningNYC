import test from 'node:test'
import assert from 'node:assert/strict'

let matchModule: typeof import('../lib/movie/match') | null = null

async function loadMatchModule() {
  process.env.DATABASE_URL ||= 'postgresql://localhost:5432/screeningnyc-test'

  if (!matchModule) {
    matchModule = await import('../lib/movie/match')
  }

  return matchModule
}

test('normalizeMovieName removes diacritic differences', async () => {
  const { normalizeMovieName } = await loadMatchModule()
  assert.equal(normalizeMovieName('Sirât'), normalizeMovieName('Sirāt'))
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
