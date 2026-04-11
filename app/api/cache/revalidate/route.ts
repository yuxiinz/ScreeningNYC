import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'

import { buildInvalidJsonResponse, jsonError } from '@/lib/api/route'

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization')

  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim()
  }

  return request.headers.get('x-revalidate-token')?.trim() || ''
}

function getUniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return []

  return [...new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  )]
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return jsonError('MISSING_SECRET', 'CRON_SECRET is not configured.', 500)
  }

  if (getBearerToken(request) !== secret) {
    return jsonError('UNAUTHORIZED', 'Invalid revalidation token.', 401)
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return buildInvalidJsonResponse()
  }

  const tags = getUniqueStrings((body as { tags?: unknown })?.tags)
  const paths = getUniqueStrings((body as { paths?: unknown })?.paths)

  if (tags.length === 0 && paths.length === 0) {
    return jsonError('INVALID_INPUT', 'Provide at least one cache tag or path.', 400)
  }

  tags.forEach((tag) => {
    revalidateTag(tag, 'max')
  })

  paths.forEach((path) => {
    revalidatePath(path)
  })

  return NextResponse.json({
    revalidated: true,
    tags,
    paths,
    now: Date.now(),
  })
}
