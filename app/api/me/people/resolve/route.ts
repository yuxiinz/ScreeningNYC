import { createTmdbResolveRoute } from '@/lib/api/tmdb-resolve-route'
import {
  resolveDirectorFromTmdbId,
  TmdbPersonNotDirectorError,
  TmdbPersonNotFoundError,
} from '@/lib/people/resolve'

export const POST = createTmdbResolveRoute({
  resolve: async (tmdbId) => {
    const person = await resolveDirectorFromTmdbId(tmdbId)

    return {
      ok: true,
      personId: person.id,
      name: person.name,
    }
  },
  errors: [
    {
      code: 'TMDB_PERSON_NOT_FOUND',
      status: 404,
      when: TmdbPersonNotFoundError,
    },
    {
      code: 'TMDB_PERSON_NOT_DIRECTOR',
      status: 422,
      when: TmdbPersonNotDirectorError,
    },
  ],
  internalErrorMessage: 'Could not resolve director right now.',
  logLabel: '[api][me][people][resolve][POST]',
})
