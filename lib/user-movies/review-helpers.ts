export function getReviewWordCount(reviewText?: string | null) {
  return (reviewText || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

export function normalizeReviewText(reviewText?: string | null) {
  const normalizedReviewText = (reviewText || '').trim()
  return normalizedReviewText || null
}
