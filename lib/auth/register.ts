import { prisma } from '@/lib/prisma'

import { isMagicLinkConfigured } from './env'
import { issueEmailVerificationToken } from './email-verification'
import { hashPassword, validatePassword } from './password'
import {
  isValidEmail,
  normalizeEmail,
  normalizeOptionalName,
} from './users'

type RegisterUserInput = {
  email: string
  password: string
  name?: string | null
}

export type RegisterUserResult =
  | {
      ok: true
      email: string
    }
  | {
      ok: false
      code: string
      message: string
    }

export async function registerUser(input: RegisterUserInput): Promise<RegisterUserResult> {
  const email = normalizeEmail(input.email)
  const name = normalizeOptionalName(input.name)
  const passwordError = validatePassword(input.password)

  if (!isValidEmail(email)) {
    return {
      ok: false,
      code: 'INVALID_EMAIL',
      message: 'Enter a valid email address.',
    }
  }

  if (passwordError) {
    return {
      ok: false,
      code: 'INVALID_PASSWORD',
      message: passwordError,
    }
  }

  if (!isMagicLinkConfigured()) {
    return {
      ok: false,
      code: 'EMAIL_NOT_CONFIGURED',
      message: 'Email delivery is not configured yet.',
    }
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      emailVerified: true,
    },
  })

  if (existing) {
    if (!existing.emailVerified && existing.passwordHash) {
      await issueEmailVerificationToken(existing)

      return {
        ok: false,
        code: 'EMAIL_ALREADY_REGISTERED_UNVERIFIED',
        message: 'This email already has an unverified account. We sent a fresh verification email.',
      }
    }

    return {
      ok: false,
      code: 'EMAIL_ALREADY_IN_USE',
      message: 'This email already has an account.',
    }
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      name,
      settings: {
        create: {},
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  })

  await issueEmailVerificationToken(user)

  return {
    ok: true,
    email: user.email,
  }
}

export async function resendRegistrationVerificationEmail(emailInput: string) {
  const email = normalizeEmail(emailInput)

  if (!isValidEmail(email)) {
    return {
      ok: false as const,
      code: 'INVALID_EMAIL',
      message: 'Enter a valid email address.',
    }
  }

  if (!isMagicLinkConfigured()) {
    return {
      ok: false as const,
      code: 'EMAIL_NOT_CONFIGURED',
      message: 'Email delivery is not configured yet.',
    }
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      emailVerified: true,
    },
  })

  if (!user || user.emailVerified || !user.passwordHash) {
    return {
      ok: true as const,
    }
  }

  await issueEmailVerificationToken(user)

  return {
    ok: true as const,
  }
}
