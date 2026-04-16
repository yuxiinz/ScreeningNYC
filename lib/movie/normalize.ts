import { canonicalizeTitle } from '@/lib/ingest/core/screening_title'

export function normalizeMovieName(input?: string | null): string {
  return canonicalizeTitle(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}