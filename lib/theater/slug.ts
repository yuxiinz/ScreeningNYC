type TheaterSlugRecord = {
  id: number
  slug: string | null
  updatedAt?: Date | null
}

export function normalizeTheaterSlug(slug: string) {
  return slug.trim().toLowerCase()
}

function compareCanonicalTheater<T extends TheaterSlugRecord>(a: T, b: T) {
  const aNormalized = a.slug ? normalizeTheaterSlug(a.slug) : null
  const bNormalized = b.slug ? normalizeTheaterSlug(b.slug) : null
  const aIsCanonical = a.slug !== null && a.slug === aNormalized
  const bIsCanonical = b.slug !== null && b.slug === bNormalized

  if (aIsCanonical !== bIsCanonical) {
    return aIsCanonical ? -1 : 1
  }

  const aUpdatedAt = a.updatedAt?.getTime() ?? 0
  const bUpdatedAt = b.updatedAt?.getTime() ?? 0

  if (aUpdatedAt !== bUpdatedAt) {
    return bUpdatedAt - aUpdatedAt
  }

  return b.id - a.id
}

export function chooseCanonicalTheaterRecord<T extends TheaterSlugRecord>(
  theaters: T[]
) {
  if (theaters.length === 0) {
    return null
  }

  return [...theaters].sort(compareCanonicalTheater)[0]
}

export function dedupeTheatersByNormalizedSlug<T extends TheaterSlugRecord>(
  theaters: T[]
) {
  const groups = new Map<string, { firstIndex: number; items: T[] }>()

  theaters.forEach((theater, index) => {
    const key = theater.slug
      ? `slug:${normalizeTheaterSlug(theater.slug)}`
      : `id:${theater.id}`
    const existing = groups.get(key)

    if (existing) {
      existing.items.push(theater)
      return
    }

    groups.set(key, {
      firstIndex: index,
      items: [theater],
    })
  })

  return [...groups.values()]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((group) => chooseCanonicalTheaterRecord(group.items))
    .filter((theater): theater is T => Boolean(theater))
}
