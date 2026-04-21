import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isSourceAccessBlockedError,
  responseLooksBlocked,
  SourceAccessBlockedError,
} from '../lib/ingest/core/source-access'

test('responseLooksBlocked detects explicit 403 responses', () => {
  assert.equal(
    responseLooksBlocked({
      status: 403,
      headers: {},
      body: '<html>forbidden</html>',
    }),
    true
  )
})

test('responseLooksBlocked detects Cloudflare challenge headers', () => {
  assert.equal(
    responseLooksBlocked({
      status: 200,
      headers: {
        'cf-mitigated': 'challenge',
      },
      body: '<html>ok</html>',
    }),
    true
  )
})

test('responseLooksBlocked detects Cloudflare challenge pages in HTML', () => {
  assert.equal(
    responseLooksBlocked({
      status: 200,
      headers: {},
      body: '<title>Just a moment...</title><body>Enable JavaScript and cookies to continue</body>',
    }),
    true
  )
})

test('responseLooksBlocked ignores ordinary successful HTML pages', () => {
  assert.equal(
    responseLooksBlocked({
      status: 200,
      headers: {},
      body: '<html><head><title>Cinema Village</title></head><body>calendar</body></html>',
    }),
    false
  )
})

test('isSourceAccessBlockedError narrows custom blocked errors', () => {
  const error = new SourceAccessBlockedError({
    theaterSlug: 'cinemavillage',
    sourceUrl: 'https://www.cinemavillage.com/calendar/',
    status: 403,
    detail: 'Cloudflare blocked the request.',
  })

  assert.equal(isSourceAccessBlockedError(error), true)
  assert.equal(isSourceAccessBlockedError(new Error('plain error')), false)
})
