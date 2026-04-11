import { createWantRouteHandlers } from '@/lib/api/want-route'
import {
  addDirectorWant,
  removeDirectorWant,
} from '@/lib/user-directors/service'

export const { PUT, DELETE } = createWantRouteHandlers({
  addWant: addDirectorWant,
  removeWant: removeDirectorWant,
  paramKey: 'personId',
  invalidParamCode: 'INVALID_PERSON_ID',
  invalidParamMessage: 'personId must be a positive integer.',
  logLabel: '[api][me][people][want]',
  internalErrorMessage: 'Could not update director want list right now.',
})
