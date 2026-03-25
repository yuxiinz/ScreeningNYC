export const FREE_TICKET_SENTINEL = 'FREE'

export function isFreeTicketValue(value?: string | null): boolean {
  return (value || '').trim().toUpperCase() === FREE_TICKET_SENTINEL
}
