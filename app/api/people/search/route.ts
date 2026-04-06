import { NextResponse } from 'next/server'

import type { DirectorSearchResult } from '@/lib/people/search-types'
import { searchLocalDirectors } from '@/lib/people/search-service'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim() || ''

  if (query.length < 2) {
    return NextResponse.json([])
  }

  const localResults = await searchLocalDirectors(query)
  const result: DirectorSearchResult[] = localResults.map((person) => ({
    id: person.id,
    name: person.name,
    tmdbId: person.tmdbId,
    filmCount: person.filmCount,
  }))

  return NextResponse.json(result)
}
