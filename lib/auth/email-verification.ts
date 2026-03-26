import crypto from 'crypto'

import { prisma } from '@/lib/prisma'

import { getAppBaseUrl } from './env'
import { sendPasswordVerificationEmail } from './email'

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function issueEmailVerificationToken(user: {
  id: string
  email: string
  name?: string | null
}) {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS)

  await prisma.emailVerificationToken.deleteMany({
    where: {
      userId: user.id,
      consumedAt: null,
    },
  })

  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  })

  const verifyUrl = `${getAppBaseUrl()}/api/auth/verify-email?token=${token}`

  await sendPasswordVerificationEmail({
    to: user.email,
    name: user.name,
    verifyUrl,
  })

  return { expiresAt }
}

export async function consumeEmailVerificationToken(token: string) {
  if (!token) {
    return { status: 'invalid' as const }
  }

  const record = await prisma.emailVerificationToken.findUnique({
    where: {
      tokenHash: hashToken(token),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          emailVerified: true,
        },
      },
    },
  })

  if (!record || record.consumedAt) {
    return { status: 'invalid' as const }
  }

  if (record.expiresAt < new Date()) {
    await prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    })

    return {
      status: 'expired' as const,
      email: record.user.email,
    }
  }

  const verifiedAt = record.user.emailVerified || new Date()

  await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: verifiedAt },
    }),
  ])

  return {
    status: 'verified' as const,
    email: record.user.email,
  }
}
