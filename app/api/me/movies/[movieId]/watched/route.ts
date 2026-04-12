import { NextResponse } from 'next/server'

import {
  buildInvalidJsonResponse,
  buildUnauthorizedResponse,
  getPositiveIntegerParam,
  jsonError,
} from '@/lib/api/route'
import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import { markWatched, removeWatched } from '@/lib/user-movies/service'
import { getReviewWordCount } from '@/lib/user-movies/review'

const WATCHED_ROUTE_LOG_LABEL = '[api][me][movies][watched]'
const WATCHED_ROUTE_ERROR_MESSAGE = 'Could not update watched list right now.'

type WatchedRouteContext = {
  params: Promise<{ movieId: string }>
}

function parseOptionalBoolean(input: unknown) {
  if (typeof input === 'undefined') return undefined
  return typeof input === 'boolean' ? input : 'invalid'
}

function parseRatingInput(input: unknown): number | null | 'invalid' {
  if (typeof input === 'undefined' || input === null) {
    return null
  }

  if (typeof input !== 'number' || Number.isNaN(input) || input < 0 || input > 5) {
    return 'invalid'
  }

  return Number.isInteger(input * 2) ? input : 'invalid'
}

function parseWatchedAtInput(input: unknown): Date | null | 'invalid' {
  if (typeof input === 'undefined' || input === null || input === '') {
    return null
  }

  if (typeof input !== 'string') {
    return 'invalid'
  }

  const trimmed = input.trim()
  if (!trimmed) return null

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    return new Date(`${year}-${month}-${day}T12:00:00.000Z`)
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? 'invalid' : parsed
}

async function resolveWatchedRouteTarget(params: WatchedRouteContext['params']) {
  const [userId, movieId] = await Promise.all([
    requireUserId(),
    getPositiveIntegerParam(params, 'movieId'),
  ])

  if (!movieId) {
    return jsonError('INVALID_MOVIE_ID', 'movieId must be a positive integer.', 400)
  }

  return { userId, movieId }
}

function buildWatchedRouteErrorResponse(method: 'PUT' | 'DELETE', error: unknown) {
  if (error instanceof AuthRequiredError) {
    return buildUnauthorizedResponse(error.message)
  }

  console.error(`${WATCHED_ROUTE_LOG_LABEL}[${method}]`, error)
  return jsonError('INTERNAL_ERROR', WATCHED_ROUTE_ERROR_MESSAGE, 500)
}

export async function PUT(request: Request, { params }: WatchedRouteContext) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return buildInvalidJsonResponse()
  }

  const payload = body as {
    confirmRemoveWant?: unknown
    preserveWatchedAt?: unknown
    watchedAt?: unknown
    rating?: unknown
    reviewText?: unknown
  }
  const confirmRemoveWant = parseOptionalBoolean(payload.confirmRemoveWant)
  const preserveWatchedAt = parseOptionalBoolean(payload.preserveWatchedAt)

  if (confirmRemoveWant === 'invalid') {
    return jsonError(
      'INVALID_CONFIRMATION',
      'confirmRemoveWant must be a boolean.',
      400
    )
  }

  if (preserveWatchedAt === 'invalid') {
    return jsonError(
      'INVALID_PRESERVE_WATCHED_AT',
      'preserveWatchedAt must be a boolean.',
      400
    )
  }

  const watchedAt = parseWatchedAtInput(payload.watchedAt)

  if (watchedAt === 'invalid') {
    return jsonError(
      'INVALID_WATCHED_AT',
      'watchedAt must be an ISO datetime string or YYYY-MM-DD.',
      400
    )
  }

  const rating = parseRatingInput(payload.rating)

  if (rating === 'invalid') {
    return jsonError(
      'INVALID_RATING',
      'rating must be null or a number from 0 to 5 in 0.5 increments.',
      400
    )
  }

  if (
    typeof payload.reviewText !== 'undefined' &&
    payload.reviewText !== null &&
    typeof payload.reviewText !== 'string'
  ) {
    return jsonError('INVALID_REVIEW', 'reviewText must be a string or null.', 400)
  }

  const reviewText = typeof payload.reviewText === 'string' ? payload.reviewText : null

  if (getReviewWordCount(reviewText) > 200) {
    return jsonError('REVIEW_TOO_LONG', 'reviewText must be 200 words or fewer.', 400)
  }

  try {
    const target = await resolveWatchedRouteTarget(params)

    if (target instanceof NextResponse) {
      return target
    }

    return NextResponse.json({
      ok: true,
      ...(await markWatched(target.userId, target.movieId, {
        confirmRemoveWant,
        preserveWatchedAt,
        watchedAt: watchedAt || undefined,
        rating,
        reviewText,
      })),
    })
  } catch (error) {
    return buildWatchedRouteErrorResponse('PUT', error)
  }
}

export async function DELETE(_request: Request, { params }: WatchedRouteContext) {
  try {
    const target = await resolveWatchedRouteTarget(params)

    if (target instanceof NextResponse) {
      return target
    }

    return NextResponse.json({
      ok: true,
      ...(await removeWatched(target.userId, target.movieId)),
    })
  } catch (error) {
    return buildWatchedRouteErrorResponse('DELETE', error)
  }
}
