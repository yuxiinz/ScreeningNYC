import { getReleaseYear } from '@/lib/movie/display'
import type { MovieSearchResult, MovieSearchStatus } from '@/lib/movie/search'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

function normalizeSearchTitle(title?: string | null) {
  return (title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

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
        select: {
          startTime: true,
          theaterId: true,
        },
        take: 1,
      },
    },
    take: 8,
    orderBy: {
      updatedAt: 'desc',
    },
  })

  const dedupedMovies = movies.filter((movie, index, arr) => {
    const firstShowtime = movie.showtimes[0]
    const normalizedTitle = normalizeSearchTitle(movie.title)
    const year = getReleaseYear(movie.releaseDate)
    const dedupeKey = firstShowtime
      ? `${normalizedTitle}|${firstShowtime.startTime.toISOString()}|${firstShowtime.theaterId}`
      : `${normalizedTitle}|${year ?? ''}`

    return (
      arr.findIndex((candidate) => {
        const candidateShowtime = candidate.showtimes[0]
        const candidateTitle = normalizeSearchTitle(candidate.title)
        const candidateYear = getReleaseYear(candidate.releaseDate)
        const candidateKey = candidateShowtime
          ? `${candidateTitle}|${candidateShowtime.startTime.toISOString()}|${candidateShowtime.theaterId}`
          : `${candidateTitle}|${candidateYear ?? ''}`

        return candidateKey === dedupeKey
      }) === index
    )
  })

  const result: MovieSearchResult[] = dedupedMovies.map((movie) => {
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
