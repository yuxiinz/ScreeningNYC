import { NextResponse } from 'next/server'

import {
  buildInvalidJsonResponse,
  buildUnauthorizedResponse,
  getPositiveIntegerParam,
  jsonError,
} from '@/lib/api/route'
import { AuthRequiredError, requireUserId } from '@/lib/auth/require-user-id'
import {
  markWatched,
  removeWatched,
} from '@/lib/user-movies/service'
import { getReviewWordCount } from '@/lib/user-movies/review'

function parseRatingInput(input: unknown): number | null | 'invalid' {
  if (typeof input === 'undefined') {
    return null
  }

  if (input === null) {
    return null
  }

  if (typeof input !== 'number' || Number.isNaN(input) || input < 0 || input > 5) {
    return 'invalid'
  }

  if (!Number.isInteger(input * 2)) {
    return 'invalid'
  }

  return input
}

function parseWatchedAtInput(input: unknown): Date | null | 'invalid' {
  if (typeof input === 'undefined' || input === null || input === '') {
    return null
  }

  if (typeof input !== 'string') {
    return 'invalid'
  }

  const trimmed = input.trim()

  if (!trimmed) {
    return null
  }

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    return new Date(`${year}-${month}-${day}T12:00:00.000Z`)
  }

  const parsed = new Date(trimmed)

  if (Number.isNaN(parsed.getTime())) {
    return 'invalid'
  }

  return parsed
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ movieId: string }> }
) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return buildInvalidJsonResponse()
  }

  const confirmRemoveWant = (body as { confirmRemoveWant?: unknown })
    ?.confirmRemoveWant
  const preserveWatchedAt = (body as { preserveWatchedAt?: unknown })
    ?.preserveWatchedAt
  const watchedAtInput = (body as { watchedAt?: unknown })?.watchedAt
  const ratingInput = (body as { rating?: unknown })?.rating
  const reviewTextInput = (body as { reviewText?: unknown })?.reviewText

  if (
    typeof confirmRemoveWant !== 'undefined' &&
    typeof confirmRemoveWant !== 'boolean'
  ) {
    return jsonError(
      'INVALID_CONFIRMATION',
      'confirmRemoveWant must be a boolean.',
      400
    )
  }

  if (
    typeof preserveWatchedAt !== 'undefined' &&
    typeof preserveWatchedAt !== 'boolean'
  ) {
    return jsonError(
      'INVALID_PRESERVE_WATCHED_AT',
      'preserveWatchedAt must be a boolean.',
      400
    )
  }

  const watchedAt = parseWatchedAtInput(watchedAtInput)

  if (watchedAt === 'invalid') {
    return jsonError(
      'INVALID_WATCHED_AT',
      'watchedAt must be an ISO datetime string or YYYY-MM-DD.',
      400
    )
  }

  const rating = parseRatingInput(ratingInput)

  if (rating === 'invalid') {
    return jsonError(
      'INVALID_RATING',
      'rating must be null or a number from 0 to 5 in 0.5 increments.',
      400
    )
  }

  if (
    typeof reviewTextInput !== 'undefined' &&
    reviewTextInput !== null &&
    typeof reviewTextInput !== 'string'
  ) {
    return jsonError('INVALID_REVIEW', 'reviewText must be a string or null.', 400)
  }

  const reviewText = typeof reviewTextInput === 'string' ? reviewTextInput : null

  if (getReviewWordCount(reviewText) > 200) {
    return jsonError('REVIEW_TOO_LONG', 'reviewText must be 200 words or fewer.', 400)
  }

  try {
    const [userId, movieId] = await Promise.all([
      requireUserId(),
      getPositiveIntegerParam(params, 'movieId'),
    ])

    if (!movieId) {
      return jsonError('INVALID_MOVIE_ID', 'movieId must be a positive integer.', 400)
    }

    const result = await markWatched(userId, movieId, {
      confirmRemoveWant,
      preserveWatchedAt,
      watchedAt: watchedAt || undefined,
      rating,
      reviewText,
    })

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error.message)
    }

    console.error('[api][me][movies][watched][PUT]', error)
    return jsonError('INTERNAL_ERROR', 'Could not update watched list right now.', 500)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ movieId: string }> }
) {
  try {
    const [userId, movieId] = await Promise.all([
      requireUserId(),
      getPositiveIntegerParam(params, 'movieId'),
    ])

    if (!movieId) {
      return jsonError('INVALID_MOVIE_ID', 'movieId must be a positive integer.', 400)
    }

    const result = await removeWatched(userId, movieId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return buildUnauthorizedResponse(error.message)
    }

    console.error('[api][me][movies][watched][DELETE]', error)
    return jsonError('INTERNAL_ERROR', 'Could not update watched list right now.', 500)
  }
}
