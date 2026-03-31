import axios from 'axios'

import type {
  ExternalPersonMovie,
  MoviePersonSyncInput,
} from '@/lib/people/types'
import {
  buildTmdbImageUrl,
  getTmdbApiKey,
} from '@/lib/tmdb/client'

type TmdbMovieCreditsPerson = {
  id: number
  name?: string
  gender?: number | null
  job?: string
  order?: number
}

type TmdbMovieCreditsResponse = {
  crew?: TmdbMovieCreditsPerson[]
  cast?: TmdbMovieCreditsPerson[]
}

type TmdbPersonMovieCredit = {
  id: number
  title?: string
  original_title?: string
  release_date?: string
  poster_path?: string | null
  popularity?: number
  job?: string
}

type TmdbPersonMovieCreditsResponse = {
  cast?: TmdbPersonMovieCredit[]
  crew?: TmdbPersonMovieCredit[]
}

function getReleaseYear(value?: string | null) {
  if (!value) return null

  const year = Number(String(value).slice(0, 4))
  return Number.isFinite(year) ? year : null
}

export function mapTmdbMovieCreditsToPeople(
  credits: TmdbMovieCreditsResponse,
  { directorLimit = 3, castLimit = 8 }: { directorLimit?: number; castLimit?: number } = {}
): MoviePersonSyncInput[] {
  const directors = (credits.crew || [])
    .filter((person) => person.job === 'Director' && person.id && person.name)
    .slice(0, directorLimit)
    .map((person, index) => ({
      tmdbId: person.id,
      name: person.name || 'Unknown',
      gender: person.gender ?? null,
      kind: 'DIRECTOR' as const,
      billingOrder: index,
    }))

  const cast = (credits.cast || [])
    .filter((person) => person.id && person.name)
    .slice(0, castLimit)
    .map((person) => ({
      tmdbId: person.id,
      name: person.name || 'Unknown',
      gender: person.gender ?? null,
      kind: 'CAST' as const,
      billingOrder: person.order,
    }))

  const seen = new Set<string>()

  return [...directors, ...cast].filter((person) => {
    const key = `${person.kind}:${person.tmdbId ?? person.name.toLowerCase()}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export async function fetchTmdbMoviePeople(
  tmdbMovieId: number
): Promise<MoviePersonSyncInput[]> {
  const apiKey = getTmdbApiKey()

  const response = await axios.get<TmdbMovieCreditsResponse>(
    `https://api.themoviedb.org/3/movie/${tmdbMovieId}/credits`,
    {
      timeout: 20000,
      params: {
        api_key: apiKey,
      },
    }
  )

  return mapTmdbMovieCreditsToPeople(response.data)
}

export async function fetchTmdbPersonFilmography(
  tmdbPersonId: number,
  { take = 10 }: { take?: number } = {}
): Promise<ExternalPersonMovie[]> {
  const apiKey = getTmdbApiKey()

  const response = await axios.get<TmdbPersonMovieCreditsResponse>(
    `https://api.themoviedb.org/3/person/${tmdbPersonId}/movie_credits`,
    {
      timeout: 20000,
      params: {
        api_key: apiKey,
      },
    }
  )

  const credits = response.data

  const combined = [
    ...(credits.cast || []),
    ...(credits.crew || []).filter((credit) => credit.job === 'Director'),
  ]

  const deduped = new Map<number, TmdbPersonMovieCredit>()

  combined.forEach((credit) => {
    if (!credit.id) return

    const existing = deduped.get(credit.id)

    if (!existing) {
      deduped.set(credit.id, credit)
      return
    }

    const existingPopularity = existing.popularity ?? Number.NEGATIVE_INFINITY
    const nextPopularity = credit.popularity ?? Number.NEGATIVE_INFINITY

    if (nextPopularity > existingPopularity) {
      deduped.set(credit.id, credit)
    }
  })

  return [...deduped.values()]
    .sort((a, b) => {
      const popularityDiff = (b.popularity ?? 0) - (a.popularity ?? 0)
      if (popularityDiff !== 0) return popularityDiff

      const yearDiff = (getReleaseYear(b.release_date) ?? 0) - (getReleaseYear(a.release_date) ?? 0)
      if (yearDiff !== 0) return yearDiff

      return (a.title || a.original_title || '').localeCompare(
        b.title || b.original_title || ''
      )
    })
    .slice(0, take)
    .map((credit) => ({
      tmdbId: credit.id,
      title: credit.title || credit.original_title || 'Untitled',
      year: getReleaseYear(credit.release_date),
      posterUrl: buildTmdbImageUrl(credit.poster_path, 'w500'),
    }))
}
