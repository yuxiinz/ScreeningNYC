import { prisma } from '@/lib/prisma'

export function normalizeEmail(input: string) {
  return input.trim().toLowerCase()
}

export function isValidEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)
}

export function normalizeOptionalName(input?: string | null) {
  const text = (input || '').replace(/\s+/g, ' ').trim()
  return text || null
}

export async function ensureUserSettings(userId: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  })
}

export async function findAuthUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      passwordHash: true,
      emailVerified: true,
    },
  })
}
