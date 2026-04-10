import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from '@/lib/auth/password'
import { normalizeOptionalName } from '@/lib/auth/users'
import { prisma } from '@/lib/prisma'

async function getRequiredUserId() {
  const session = await auth()
  return session?.user?.id || null
}

function hasOwnProperty(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export async function PUT(request: Request) {
  const userId = await getRequiredUserId()

  if (!userId) {
    return NextResponse.json(
      {
        code: 'UNAUTHORIZED',
        message: 'Sign in required.',
      },
      { status: 401 }
    )
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON.',
      },
      { status: 400 }
    )
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      {
        code: 'INVALID_BODY',
        message: 'Request body must be a JSON object.',
      },
      { status: 400 }
    )
  }

  if (hasOwnProperty(body, 'email')) {
    return NextResponse.json(
      {
        code: 'EMAIL_IMMUTABLE',
        message: 'Email cannot be changed.',
      },
      { status: 400 }
    )
  }

  const hasNameUpdate = hasOwnProperty(body, 'name')
  const hasPasswordUpdate = hasOwnProperty(body, 'newPassword')

  if (!hasNameUpdate && !hasPasswordUpdate) {
    return NextResponse.json(
      {
        code: 'NO_CHANGES',
        message: 'Provide a new name or password to update your account.',
      },
      { status: 400 }
    )
  }

  const rawName = (body as { name?: unknown }).name
  const rawCurrentPassword = (body as { currentPassword?: unknown }).currentPassword
  const rawNewPassword = (body as { newPassword?: unknown }).newPassword

  if (hasNameUpdate && typeof rawName !== 'string') {
    return NextResponse.json(
      {
        code: 'INVALID_NAME',
        message: 'Name must be a string.',
      },
      { status: 400 }
    )
  }

  if (
    hasOwnProperty(body, 'currentPassword') &&
    typeof rawCurrentPassword !== 'string'
  ) {
    return NextResponse.json(
      {
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password must be a string.',
      },
      { status: 400 }
    )
  }

  if (hasPasswordUpdate && typeof rawNewPassword !== 'string') {
    return NextResponse.json(
      {
        code: 'INVALID_NEW_PASSWORD',
        message: 'New password must be a string.',
      },
      { status: 400 }
    )
  }

  const nextName = hasNameUpdate ? (rawName as string) : undefined
  const currentPassword =
    typeof rawCurrentPassword === 'string' ? rawCurrentPassword : null
  const newPassword = hasPasswordUpdate ? (rawNewPassword as string) : null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
    },
  })

  if (!user) {
    return NextResponse.json(
      {
        code: 'USER_NOT_FOUND',
        message: 'User account not found.',
      },
      { status: 404 }
    )
  }

  const updateData: {
    name?: string | null
    passwordHash?: string
  } = {}

  if (hasNameUpdate) {
    const normalizedName = normalizeOptionalName(nextName)

    if (normalizedName !== user.name) {
      updateData.name = normalizedName
    }
  }

  if (newPassword !== null) {
    const passwordError = validatePassword(newPassword)

    if (passwordError) {
      return NextResponse.json(
        {
          code: 'INVALID_PASSWORD',
          message: passwordError,
        },
        { status: 400 }
      )
    }

    if (user.passwordHash) {
      if (!currentPassword) {
        return NextResponse.json(
          {
            code: 'CURRENT_PASSWORD_REQUIRED',
            message: 'Enter your current password to set a new one.',
          },
          { status: 400 }
        )
      }

      const currentPasswordMatches = await verifyPassword(
        currentPassword,
        user.passwordHash
      )

      if (!currentPasswordMatches) {
        return NextResponse.json(
          {
            code: 'CURRENT_PASSWORD_INCORRECT',
            message: 'Current password is incorrect.',
          },
          { status: 400 }
        )
      }

      const nextPasswordMatchesCurrent = await verifyPassword(
        newPassword,
        user.passwordHash
      )

      if (nextPasswordMatchesCurrent) {
        return NextResponse.json(
          {
            code: 'PASSWORD_UNCHANGED',
            message: 'Choose a different new password.',
          },
          { status: 400 }
        )
      }
    }

    updateData.passwordHash = await hashPassword(newPassword)
  }

  const updatedUser =
    Object.keys(updateData).length > 0
      ? await prisma.user.update({
          where: { id: userId },
          data: updateData,
          select: {
            email: true,
            name: true,
            passwordHash: true,
          },
        })
      : user

  return NextResponse.json({
    email: updatedUser.email,
    name: updatedUser.name,
    hasPassword: Boolean(updatedUser.passwordHash),
  })
}
