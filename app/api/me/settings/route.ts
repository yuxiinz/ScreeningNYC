import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

async function getRequiredUserId() {
  const session = await auth()
  return session?.user?.id || null
}

export async function GET() {
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

  const watchlistEmailEnabled = (body as { watchlistEmailEnabled?: unknown })
    ?.watchlistEmailEnabled

  if (typeof watchlistEmailEnabled !== 'boolean') {
    return NextResponse.json(
      {
        code: 'INVALID_SETTINGS',
        message: 'watchlistEmailEnabled must be a boolean.',
      },
      { status: 400 }
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
