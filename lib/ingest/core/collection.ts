export function dedupeByKeys<T>(
  items: T[],
  getKeys: (item: T) => Array<string | null | undefined>
): T[] {
  const seen = new Set<string>()
  const deduped: T[] = []

  for (const item of items) {
    const keys = getKeys(item).filter(
      (key): key is string => Boolean(key)
    )

    if (keys.some((key) => seen.has(key))) {
      continue
    }

    keys.forEach((key) => seen.add(key))
    deduped.push(item)
  }

  return deduped
}
