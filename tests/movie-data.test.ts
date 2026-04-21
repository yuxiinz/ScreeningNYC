import test from 'node:test'
import assert from 'node:assert/strict'

let movieDataModule: typeof import('../lib/movie/movie-data') | null = null

async function loadMovieDataModule() {
  process.env.DATABASE_URL ||= 'postgresql://localhost:5432/screeningnyc-test'

  if (!movieDataModule) {
    movieDataModule = await import('../lib/movie/movie-data')
  }

  return movieDataModule
}

test('normalizeFallbackMovieTitle keeps meaningful curatorial titles and never returns empty', async () => {
  const { normalizeFallbackMovieTitle } = await loadMovieDataModule()

  assert.equal(
    normalizeFallbackMovieTitle('PRESENTED BY RAYMOND FOYE: JORDAN BELSON RARITIES'),
    'JORDAN BELSON RARITIES'
  )
  assert.equal(
    normalizeFallbackMovieTitle('PRESENTED BY THE FILM FOUNDATION'),
    'PRESENTED BY THE FILM FOUNDATION'
  )
  assert.equal(normalizeFallbackMovieTitle('   '), 'Untitled')
})
