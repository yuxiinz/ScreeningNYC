// lib/ingest/services/tmdb_service.ts

import { normalizeScreeningMovieTitle } from '../core/screening_title'
import {
  normalizeWhitespace,
  stripLeadingBullets,
  isLikelyProgramTitle,
} from '../core/text'
import { fetchJson } from '@/lib/http/server-fetch'
import { mapTmdbMovieCreditsToDirectors } from '@/lib/people/tmdb'
import type { MovieDirectorSyncInput } from '@/lib/people/types'
import { buildTmdbImageUrl } from '@/lib/tmdb/client'

export type TmdbMovie = {
  tmdbId?: number
  title: string
  originalTitle?: string
  releaseDate?: Date
  runtimeMinutes?: number
  overview?: string
  posterUrl?: string
  backdropUrl?: string
  imdbUrl?: string
  officialSiteUrl?: string
  genresText?: string
  productionCountriesText?: string
  directorText?: string
  castText?: string
  directorCredits?: MovieDirectorSyncInput[]
  matchedQueryTitle?: string
}

type SearchTmdbParams = {
  title: string
  titleCandidates?: string[]
  directorText?: string
  releaseYear?: number
  runtimeMinutes?: number
  tmdbApiKey?: string
}

type TmdbSearchMovieResult = {
  id: number
}

type TmdbSearchMovieResponse = {
  results?: TmdbSearchMovieResult[]
}

type TmdbMovieDetailResponse = {
  id: number
  title?: string
  original_title?: string
  release_date?: string
  runtime?: number
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  homepage?: string | null
  genres?: Array<{
    name?: string
  }>
  production_countries?: Array<{
    name?: string
  }>
}

type TmdbCreditsPerson = {
  id: number
  job?: string
  name?: string
  gender?: number | null
  order?: number
}

type TmdbCreditsResponse = {
  crew?: TmdbCreditsPerson[]
  cast?: TmdbCreditsPerson[]
}

type TmdbExternalIdsResponse = {
  imdb_id?: string | null
}

export function canonicalizeTitle(title: string): string {
  return stripLeadingBullets(title)
    .replace(/\bpreceded by\b.*$/i, '')
    .replace(/\bmembers only:\b/i, '')
    .replace(/\bace presents\b/i, '')
    .replace(/\basc presents\b/i, '')
    .replace(/\bpresented by\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeName(name?: string) {
  return normalizeWhitespace(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function splitCompactLatinTitle(title: string) {
  return title
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/[:._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function addArticleSplitVariant(title: string, variants: Set<string>) {
  const compact = title.trim()

  if (!compact || /\s/.test(compact)) {
    return
  }

  const lower = compact.toLowerCase()
  const prefixes = ['the', 'le', 'la', 'les', 'un', 'une', 'el', 'los', 'las']

  for (const prefix of prefixes) {
    if (!lower.startsWith(prefix) || compact.length <= prefix.length + 2) {
      continue
    }

    const remainder = compact.slice(prefix.length)

    if (!/^\p{L}[\p{L}\p{N}'’.-]*$/u.test(remainder)) {
      continue
    }

    variants.add(
      `${compact.slice(0, prefix.length)} ${remainder}`.replace(/\s+/g, ' ').trim()
    )
  }
}

export function expandTmdbQueryVariants(title: string): string[] {
  const normalized = normalizeWhitespace(title).trim()

  if (!normalized) {
    return []
  }

  const variants = new Set<string>([normalized])
  const splitCompact = splitCompactLatinTitle(normalized)

  if (splitCompact) {
    variants.add(splitCompact)
  }

  addArticleSplitVariant(normalized, variants)
  addArticleSplitVariant(splitCompact, variants)

  return [...variants].filter(Boolean)
}

function isMostlyCjkTitle(title: string) {
  const letters = [...title].filter((char) => /\p{L}/u.test(char))

  if (!letters.length) {
    return false
  }

  const cjkLetters = letters.filter((char) => /\p{Script=Han}/u.test(char))
  return cjkLetters.length / letters.length >= 0.5
}

export function buildTmdbQueryCandidates(params: {
  title: string
  titleCandidates?: string[]
}): string[] {
  const baseCandidates = (params.titleCandidates?.length
    ? params.titleCandidates
    : [params.title]
  )
    .map((candidate) => normalizeTmdbQueryTitle(candidate))
    .filter(Boolean)
    .filter((candidate, index, arr) => arr.indexOf(candidate) === index)

  if (!baseCandidates.length) {
    return []
  }

  const [primaryTitle, ...aliases] = baseCandidates
  const aliasNonCjk = aliases.filter((candidate) => !isMostlyCjkTitle(candidate))
  const aliasCjk = aliases.filter((candidate) => isMostlyCjkTitle(candidate))
  const orderedBases = [...aliasNonCjk, ...aliasCjk, primaryTitle]

  return orderedBases
    .flatMap((candidate) => expandTmdbQueryVariants(candidate))
    .map((candidate) => normalizeWhitespace(candidate))
    .filter(Boolean)
    .filter((candidate, index, arr) => arr.indexOf(candidate) === index)
    .slice(0, 8)
}

function getSearchRankBonus(rank: number, resultCount: number) {
  const rankBonus = [40, 26, 16, 10, 5, 0][rank] ?? 0

  if (resultCount === 1 && rank === 0) {
    return rankBonus + 35
  }

  if (resultCount <= 3 && rank === 0) {
    return rankBonus + 12
  }

  return rankBonus
}

function normalizeTmdbQueryTitle(title?: string | null): string {
  const canonical = canonicalizeTitle(title || '')
  return normalizeWhitespace(normalizeScreeningMovieTitle(canonical) || canonical)
}

function shouldSkipTmdbSearch(params: SearchTmdbParams): boolean {
  const title = normalizeTmdbQueryTitle(params.title)
  if (!title) return true
  if (isLikelyProgramTitle(title)) return true

  const lower = title.toLowerCase()
  if (
    lower.includes('presented by') ||
    lower.includes('retrospective') ||
    lower.includes('archive dive') ||
    lower.includes('program') ||
    lower.includes('series')
  ) {
    return true
  }

  return false
}

function scoreCandidate(params: {
  scrapedTitle: string
  scrapedDirector?: string
  scrapedYear?: number
  scrapedRuntime?: number
  candidateTitle?: string
  candidateOriginalTitle?: string
  candidateYear?: number
  candidateDirector?: string
  candidateRuntime?: number
}) {
  let score = 0

  const scrapedTitle = normalizeName(params.scrapedTitle)
  const candidateTitle = normalizeName(params.candidateTitle)
  const candidateOriginalTitle = normalizeName(params.candidateOriginalTitle)

  if (scrapedTitle && candidateTitle && scrapedTitle === candidateTitle) {
    score += 90
  } else if (
    scrapedTitle &&
    candidateOriginalTitle &&
    scrapedTitle === candidateOriginalTitle
  ) {
    score += 80
  } else if (
    scrapedTitle &&
    ((candidateTitle &&
      (candidateTitle.includes(scrapedTitle) || scrapedTitle.includes(candidateTitle))) ||
      (candidateOriginalTitle &&
        (candidateOriginalTitle.includes(scrapedTitle) ||
          scrapedTitle.includes(candidateOriginalTitle))))
  ) {
    score += 35
  }

  if (params.scrapedDirector && params.candidateDirector) {
    const sd = normalizeName(params.scrapedDirector)
    const cd = normalizeName(params.candidateDirector)

    if (sd && cd && (sd === cd || sd.includes(cd) || cd.includes(sd))) {
      score += 60
    } else {
      score -= 20
    }
  }

  if (params.scrapedYear && params.candidateYear) {
    const diff = Math.abs(params.scrapedYear - params.candidateYear)
    if (diff === 0) score += 55
    else if (diff === 1) score += 20
    else if (diff === 2) score += 8
    else score -= 20
  }

  if (params.scrapedRuntime && params.candidateRuntime) {
    const diff = Math.abs(params.scrapedRuntime - params.candidateRuntime)
    if (diff <= 2) score += 12
    else if (diff <= 5) score += 6
    else if (diff >= 20) score -= 10
  }

  return score
}

function buildFallbackOnly(params: SearchTmdbParams): TmdbMovie {
  const fallbackTitle = normalizeTmdbQueryTitle(params.title) || canonicalizeTitle(params.title)

  return {
    title: fallbackTitle || params.title,
    releaseDate: params.releaseYear
      ? new Date(`${params.releaseYear}-01-01T00:00:00.000Z`)
      : undefined,
    runtimeMinutes: params.runtimeMinutes,
    directorText: params.directorText,
  }
}

export async function searchTmdbMovie(params: SearchTmdbParams): Promise<TmdbMovie> {
  if (!params.tmdbApiKey) {
    return buildFallbackOnly(params)
  }

  if (shouldSkipTmdbSearch(params)) {
    return buildFallbackOnly(params)
  }

  const candidateQueries = buildTmdbQueryCandidates({
    title: params.title,
    titleCandidates: params.titleCandidates,
  })

  if (!candidateQueries.length) {
    return buildFallbackOnly(params)
  }

  let best: {
    detail: TmdbMovieDetailResponse
    credits: TmdbCreditsResponse
    matchedQuery: string
    searchRank: number
    resultCount: number
    exactTitleMatch: boolean
    exactOriginalTitleMatch: boolean
  } | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const query of candidateQueries) {
    const searchRes = await fetchJson<TmdbSearchMovieResponse>(
      'https://api.themoviedb.org/3/search/movie',
      {
        timeout: 20000,
        params: {
          api_key: params.tmdbApiKey,
          query,
          include_adult: false,
          year: params.releaseYear,
        },
      }
    )

    const results = searchRes.data?.results || []
    if (!results.length) {
      continue
    }

    for (const [index, candidate] of results.slice(0, 6).entries()) {
      const movieId = candidate.id

      try {
        const [detailRes, creditsRes] = await Promise.all([
          fetchJson<TmdbMovieDetailResponse>(
            `https://api.themoviedb.org/3/movie/${movieId}`,
            {
              timeout: 20000,
              params: { api_key: params.tmdbApiKey },
            }
          ),
          fetchJson<TmdbCreditsResponse>(
            `https://api.themoviedb.org/3/movie/${movieId}/credits`,
            {
              timeout: 20000,
              params: { api_key: params.tmdbApiKey },
            }
          ),
        ])

        const detail = detailRes.data
        const credits = creditsRes.data

        const director = (credits.crew || []).find((p) => p.job === 'Director')?.name
        const year = detail?.release_date
          ? Number(String(detail.release_date).slice(0, 4))
          : undefined
        const normalizedQuery = normalizeName(query)
        const normalizedCandidateTitle = normalizeName(detail.title)
        const normalizedCandidateOriginalTitle = normalizeName(detail.original_title)
        const exactTitleMatch =
          Boolean(normalizedQuery) && normalizedQuery === normalizedCandidateTitle
        const exactOriginalTitleMatch =
          Boolean(normalizedQuery) && normalizedQuery === normalizedCandidateOriginalTitle

        const score =
          scoreCandidate({
            scrapedTitle: query,
            scrapedDirector: params.directorText,
            scrapedYear: params.releaseYear,
            scrapedRuntime: params.runtimeMinutes,
            candidateTitle: detail.title,
            candidateOriginalTitle: detail.original_title,
            candidateYear: year,
            candidateDirector: director,
            candidateRuntime: detail.runtime,
          }) + getSearchRankBonus(index, results.length)

        if (score > bestScore) {
          bestScore = score
          best = {
            detail,
            credits,
            matchedQuery: query,
            searchRank: index,
            resultCount: results.length,
            exactTitleMatch,
            exactOriginalTitleMatch,
          }
        }
      } catch {
        continue
      }
    }
  }

  const hasSupportingMetadata = Boolean(
    params.directorText || params.releaseYear || params.runtimeMinutes
  )
  if (!best) {
    return buildFallbackOnly(params)
  }

  const matchesConfidently =
    bestScore >= (hasSupportingMetadata ? 95 : 80) ||
    (best.exactTitleMatch && bestScore >= 88) ||
    (best.exactOriginalTitleMatch && bestScore >= 75) ||
    (!hasSupportingMetadata &&
      best.searchRank === 0 &&
      best.resultCount === 1 &&
      bestScore >= 70)

  if (!matchesConfidently) {
    return buildFallbackOnly(params)
  }

  const externalRes = await fetchJson<TmdbExternalIdsResponse>(
    `https://api.themoviedb.org/3/movie/${best.detail.id}/external_ids`,
    {
      timeout: 20000,
      params: { api_key: params.tmdbApiKey },
    }
  )

  const detail = best.detail
  const credits = best.credits
  const external = externalRes.data

  const directors = (credits?.crew || [])
    .filter((p) => p.job === 'Director')
    .slice(0, 3)
    .map((p) => p.name)
    .filter(Boolean)
    .join(', ')

  const cast = (credits?.cast || [])
    .slice(0, 8)
    .map((p) => p.name)
    .filter(Boolean)
    .join(', ')

  const genres = (detail?.genres || [])
    .map((g) => g.name)
    .filter(Boolean)
    .join(', ')
  const productionCountries = (detail?.production_countries || [])
    .map((country) => country.name)
    .filter(Boolean)
    .join(', ')

  return {
    tmdbId: detail.id,
    title: detail.title || best.matchedQuery,
    originalTitle: detail.original_title || undefined,
    releaseDate: detail.release_date ? new Date(detail.release_date) : undefined,
    runtimeMinutes: detail.runtime || params.runtimeMinutes,
    overview: detail.overview || undefined,
    posterUrl: detail.poster_path
      ? buildTmdbImageUrl(detail.poster_path, 'w500') || undefined
      : undefined,
    backdropUrl: detail.backdrop_path
      ? buildTmdbImageUrl(detail.backdrop_path, 'w780') || undefined
      : undefined,
    imdbUrl: external?.imdb_id ? `https://www.imdb.com/title/${external.imdb_id}` : undefined,
    officialSiteUrl: detail.homepage || undefined,
    genresText: genres || undefined,
    productionCountriesText: productionCountries || undefined,
    directorText: directors || params.directorText,
    castText: cast || undefined,
    directorCredits: mapTmdbMovieCreditsToDirectors(credits),
    matchedQueryTitle: best.matchedQuery,
  }
}
