import { handleTmdbResolveRoute } from '@/lib/api/tmdb-resolve-route'
import {
  resolveDirectorFromTmdbId,
  TmdbPersonNotDirectorError,
  TmdbPersonNotFoundError,
} from '@/lib/people/resolve'

export async function POST(request: Request) {
  return handleTmdbResolveRoute({
    request,
    resolveEntity: resolveDirectorFromTmdbId,
    buildSuccessBody: (person) => ({
      ok: true,
      personId: person.id,
      name: person.name,
    }),
    customErrors: [
      {
        code: 'TMDB_PERSON_NOT_FOUND',
        errorType: TmdbPersonNotFoundError,
        status: 404,
      },
      {
        code: 'TMDB_PERSON_NOT_DIRECTOR',
        errorType: TmdbPersonNotDirectorError,
        status: 422,
      },
    ],
    internalErrorMessage: 'Could not resolve director right now.',
    logLabel: '[api][me][people][resolve][POST]',
  })
}
