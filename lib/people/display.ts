import type { MoviePersonKindValue } from '@/lib/people/types'

function getActingLabel(gender?: number | null) {
  return gender === 1 ? 'Actress' : 'Actor'
}

export function getPersonProfessionLabel(input: {
  kinds: MoviePersonKindValue[]
  gender?: number | null
}) {
  const kindSet = new Set(input.kinds)
  const parts: string[] = []

  if (kindSet.has('DIRECTOR')) {
    parts.push('Director')
  }

  if (kindSet.has('CAST')) {
    parts.push(getActingLabel(input.gender))
  }

  return parts.join('/') || 'Person'
}
