type MessagePayload = {
  message?: unknown
}

export async function getErrorMessageFromResponse(
  response: Response,
  fallbackMessage: string
) {
  try {
    const payload = (await response.json()) as MessagePayload

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message
    }
  } catch {}

  return fallbackMessage
}
