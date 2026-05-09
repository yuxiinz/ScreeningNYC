export function getUpcomingShowtimeWhere(now: Date = new Date()) {
  return {
    startTime: {
      gt: now,
    },
    status: 'SCHEDULED' as const,
  }
}

export function getShowtimeDisplayTitle(
  shownTitle?: string | null,
  movieTitle?: string | null
) {
  const shown = (shownTitle || '').replace(/\s+/g, ' ').trim()
  const movie = (movieTitle || '').replace(/\s+/g, ' ').trim()

  if (!shown) return ''
  if (!movie) return shown
  if (shown.toLowerCase() === movie.toLowerCase()) return ''

  return shown
}
