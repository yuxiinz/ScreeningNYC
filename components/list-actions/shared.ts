import { getErrorMessageFromResponse } from '@/lib/api/client-response'

type ListActionButtonTone = 'default' | 'positive'

type ToggleListActionOptions = {
  endpoint: string
  fallbackError: string
  isActive: boolean
}

export function buildListActionButtonClass({
  compact,
  isActive,
  tone = 'default',
}: {
  compact: boolean
  isActive: boolean
  tone?: ListActionButtonTone
}) {
  return [
    'rounded-panel border font-bold tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    compact ? 'px-2.5 py-1.5 text-[0.68rem]' : 'px-3 py-2 text-[0.76rem]',
    tone === 'positive'
      ? isActive
        ? 'border-accent-positive bg-accent-positive text-page-bg'
        : 'border-border-input text-text-secondary hover:border-accent-positive hover:text-accent-positive'
      : isActive
        ? 'border-text-primary bg-text-primary text-page-bg'
        : 'border-border-input text-text-secondary hover:border-text-primary hover:text-text-primary',
  ].join(' ')
}

export async function toggleListAction({
  endpoint,
  fallbackError,
  isActive,
}: ToggleListActionOptions) {
  const response = await fetch(endpoint, {
    method: isActive ? 'DELETE' : 'PUT',
  })

  if (!response.ok) {
    throw new Error(await getErrorMessageFromResponse(response, fallbackError))
  }

  return !isActive
}
