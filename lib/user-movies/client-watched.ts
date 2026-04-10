import { getErrorMessageFromResponse } from '@/lib/api/client-response'

type SaveMovieWatchedEntryOptions = {
  fallbackError: string
  movieId: number
  preserveWatchedAt?: boolean
  rating: number | null
  reviewText: string | null
}

export function normalizeClientReviewText(reviewText: string) {
  return reviewText.trim()
}

export async function saveMovieWatchedEntry({
  fallbackError,
  movieId,
  preserveWatchedAt = false,
  rating,
  reviewText,
}: SaveMovieWatchedEntryOptions) {
  const response = await fetch(`/api/me/movies/${movieId}/watched`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      preserveWatchedAt,
      rating,
      reviewText,
    }),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessageFromResponse(response, fallbackError))
  }
}
