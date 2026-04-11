import { createWantRouteHandlers } from '@/lib/api/want-route'
import { addWant, removeWant } from '@/lib/user-movies/service'

export const { PUT, DELETE } = createWantRouteHandlers({
  addWant,
  removeWant,
  paramKey: 'movieId',
  invalidParamCode: 'INVALID_MOVIE_ID',
  invalidParamMessage: 'movieId must be a positive integer.',
  logLabel: '[api][me][movies][want]',
  internalErrorMessage: 'Could not update want list right now.',
})
