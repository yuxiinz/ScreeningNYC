import { NextResponse } from 'next/server'

import {
  buildInvalidJsonResponse,
  buildUnauthorizedResponse,
  jsonError,
} from '@/lib/api/route'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const userId = await getCurrentUserId()

  if (!userId) {
    return buildUnauthorizedResponse()
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: {
      watchlistEmailEnabled: true,
    },
  })

  return NextResponse.json(settings)
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

  const watchlistEmailEnabled = (body as { watchlistEmailEnabled?: unknown })
    ?.watchlistEmailEnabled

  if (typeof watchlistEmailEnabled !== 'boolean') {
    return jsonError(
      'INVALID_SETTINGS',
      'watchlistEmailEnabled must be a boolean.',
      400
    )
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId },
    update: { watchlistEmailEnabled },
    create: { userId, watchlistEmailEnabled },
    select: {
      watchlistEmailEnabled: true,
    },
  })

  return NextResponse.json(settings)
}
