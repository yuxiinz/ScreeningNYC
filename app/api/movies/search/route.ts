import { getReleaseYear } from '@/lib/movie/display'
import type { MovieSearchResult, MovieSearchStatus } from '@/lib/movie/search'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json([])
  }

  const now = new Date()

  const movies = await prisma.movie.findMany({
    where: {
      OR: [
        {
          title: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          originalTitle: {
            contains: q,
            mode: 'insensitive',
          },
        },
      ],
    },
    include: {
      showtimes: {
        where: {
          startTime: {
            gt: now,
          },
          status: 'SCHEDULED',
        },
        take: 1,
      },
    },
    take: 8,
    orderBy: {
      updatedAt: 'desc',
    },
  })

  const result: MovieSearchResult[] = movies.map((movie) => {
    let status: MovieSearchStatus = 'NONE'

    if (movie.showtimes.length > 0) {
      status = 'NOW_SHOWING'
    }

    return {
      id: movie.id,
      title: movie.title,
      year: getReleaseYear(movie.releaseDate),
      status,
    }
  })

  return NextResponse.json(result)
}
