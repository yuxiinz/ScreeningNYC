'use client'

import { useRouter } from 'next/navigation'

import EntitySearchBox from '@/components/search/EntitySearchBox'
import {
  createTmdbClientEntityRoutes,
} from '@/lib/api/client-search'
import type {
  DirectorSearchResult,
  MeDirectorSearchExternalResult,
} from '@/lib/people/search-types'

type PersonSearchBoxProps = {
  isAuthenticated?: boolean
}

function getFilmCountLabel(filmCount: number) {
  return `${filmCount} film${filmCount === 1 ? '' : 's'} in database`
}

const personRoutes = createTmdbClientEntityRoutes<
  DirectorSearchResult,
  MeDirectorSearchExternalResult,
  DirectorSearchResult,
  'personId'
>({
  resolve: {
    endpoint: '/api/me/people/resolve',
    errorMessage: 'Could not create a director page right now.',
    idKey: 'personId',
    invalidPayloadErrorMessage: 'Resolved director did not return a person id.',
  },
  search: {
    authenticatedEndpoint: '/api/me/people/search',
    errorMessage: 'Could not search directors right now.',
    invalidPayloadLabel: 'Director search API',
    publicEndpoint: '/api/people/search',
    transformPublicResults: (people) => people,
  },
})

export default function PersonSearchBox({
  isAuthenticated = false,
}: PersonSearchBoxProps) {
  const router = useRouter()

  return (
    <EntitySearchBox<DirectorSearchResult, MeDirectorSearchExternalResult>
      emptyMessage={
        isAuthenticated
          ? 'No directors found in Screening NYC or TMDB.'
          : 'No directors found'
      }
      externalDisabledClassName="disabled:cursor-wait disabled:opacity-70"
      getExternalKey={(person) => person.tmdbId}
      getLocalKey={(person) => person.id}
      isAuthenticated={isAuthenticated}
      onLocalSelect={(person) => {
        router.push(`/people/${person.id}`)
      }}
      placeholder="Search all directors"
      renderLocalResult={(person) => (
        <>
          <div className="text-[0.92rem] font-medium leading-[1.3]">
            {person.name}
          </div>
          <div className="mt-1 text-[0.78rem] text-text-muted">
            {getFilmCountLabel(person.filmCount)}
          </div>
        </>
      )}
      renderExternalResult={(person, isPending) => (
        <>
          <div className="text-[0.92rem] font-medium leading-[1.3]">
            {person.name}
          </div>
          <div className="mt-1 text-[0.78rem] text-text-muted">
            {isPending ? 'Adding director...' : 'TMDB director'}
          </div>
        </>
      )}
      resolveExternal={async (person) => {
        const personId = await personRoutes.resolve(person.tmdbId)

        router.push(`/people/${personId}`)
      }}
      search={personRoutes.search}
    />
  )
}
