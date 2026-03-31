import type { MovieSearchResult } from '@/lib/movie/search'
import { searchLocalMovies } from '@/lib/movie/search-service'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json([])
  }

  const localResults = await searchLocalMovies(q)
  const result: MovieSearchResult[] = localResults.map((movie) => ({
    id: movie.id,
    title: movie.title,
    year: movie.year,
    status: movie.status,
  }))

  return NextResponse.json(result)
}
