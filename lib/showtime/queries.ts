export function getUpcomingShowtimeWhere(now: Date = new Date()) {
  return {
    startTime: {
      gt: now,
    },
    status: 'SCHEDULED' as const,
  }
}
