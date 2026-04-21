import { createWantRouteHandlers } from '@/lib/api/want-route'
import {
  addPersonWant,
  removePersonWant,
} from '@/lib/user-people/service'

export const { PUT, DELETE } = createWantRouteHandlers({
  addWant: addPersonWant,
  removeWant: removePersonWant,
  paramKey: 'personId',
  invalidParamCode: 'INVALID_PERSON_ID',
  invalidParamMessage: 'personId must be a positive integer.',
  logLabel: '[api][me][people][want]',
  internalErrorMessage: 'Could not update director want list right now.',
})
