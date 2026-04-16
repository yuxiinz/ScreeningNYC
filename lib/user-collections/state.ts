export function getUniquePositiveIds(ids: number[]) {
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))]
}

export function createCollectionStateMap<TState>(
  ids: number[],
  createInitialState: () => TState
) {
  const uniqueIds = getUniquePositiveIds(ids)
  const states = new Map<number, TState>()

  uniqueIds.forEach((id) => {
    states.set(id, createInitialState())
  })

  return {
    states,
    uniqueIds,
  }
}

export function patchCollectionState<TState extends object>(
  states: Map<number, TState>,
  id: number,
  patch: Partial<TState>,
  createInitialState: () => TState
) {
  states.set(id, {
    ...(states.get(id) || createInitialState()),
    ...patch,
  })
}

export async function buildCollectionStateMap<TState>(
  ids: number[],
  userId: string | null,
  createInitialState: () => TState,
  populate: (
    uniqueIds: number[],
    states: Map<number, TState>,
    userId: string
  ) => Promise<void>
): Promise<Map<number, TState>> {
  const { states, uniqueIds } = createCollectionStateMap(ids, createInitialState)

  if (userId && uniqueIds.length > 0) {
    await populate(uniqueIds, states, userId)
  }

  return states
}
