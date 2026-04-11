import { NextResponse } from 'next/server'

import {
  buildInvalidJsonResponse,
  buildUnauthorizedResponse,
  jsonError,
} from '@/lib/api/route'
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from '@/lib/auth/password'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import { normalizeOptionalName } from '@/lib/auth/users'
import { prisma } from '@/lib/prisma'

function hasOwnProperty(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export async function PUT(request: Request) {
  const userId = await getCurrentUserId()

  if (!userId) {
    return buildUnauthorizedResponse()
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return buildInvalidJsonResponse()
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('INVALID_BODY', 'Request body must be a JSON object.', 400)
  }

  if (hasOwnProperty(body, 'email')) {
    return jsonError('EMAIL_IMMUTABLE', 'Email cannot be changed.', 400)
  }

  const hasNameUpdate = hasOwnProperty(body, 'name')
  const hasPasswordUpdate = hasOwnProperty(body, 'newPassword')

  if (!hasNameUpdate && !hasPasswordUpdate) {
    return jsonError(
      'NO_CHANGES',
      'Provide a new name or password to update your account.',
      400
    )
  }

  const rawName = (body as { name?: unknown }).name
  const rawCurrentPassword = (body as { currentPassword?: unknown }).currentPassword
  const rawNewPassword = (body as { newPassword?: unknown }).newPassword

  if (hasNameUpdate && typeof rawName !== 'string') {
    return jsonError('INVALID_NAME', 'Name must be a string.', 400)
  }

  if (
    hasOwnProperty(body, 'currentPassword') &&
    typeof rawCurrentPassword !== 'string'
  ) {
    return jsonError(
      'INVALID_CURRENT_PASSWORD',
      'Current password must be a string.',
      400
    )
  }

  if (hasPasswordUpdate && typeof rawNewPassword !== 'string') {
    return jsonError('INVALID_NEW_PASSWORD', 'New password must be a string.', 400)
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
    return jsonError('USER_NOT_FOUND', 'User account not found.', 404)
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
      return jsonError('INVALID_PASSWORD', passwordError, 400)
    }

    if (user.passwordHash) {
      if (!currentPassword) {
        return jsonError(
          'CURRENT_PASSWORD_REQUIRED',
          'Enter your current password to set a new one.',
          400
        )
      }

      const currentPasswordMatches = await verifyPassword(
        currentPassword,
        user.passwordHash
      )

      if (!currentPasswordMatches) {
        return jsonError(
          'CURRENT_PASSWORD_INCORRECT',
          'Current password is incorrect.',
          400
        )
      }

      const nextPasswordMatchesCurrent = await verifyPassword(
        newPassword,
        user.passwordHash
      )

      if (nextPasswordMatchesCurrent) {
        return jsonError(
          'PASSWORD_UNCHANGED',
          'Choose a different new password.',
          400
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
