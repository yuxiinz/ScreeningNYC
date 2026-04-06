import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'

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
    return NextResponse.json(
      {
        code: 'MISSING_SECRET',
        message: 'CRON_SECRET is not configured.',
      },
      { status: 500 }
    )
  }

  if (getBearerToken(request) !== secret) {
    return NextResponse.json(
      {
        code: 'UNAUTHORIZED',
        message: 'Invalid revalidation token.',
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

  const tags = getUniqueStrings((body as { tags?: unknown })?.tags)
  const paths = getUniqueStrings((body as { paths?: unknown })?.paths)

  if (tags.length === 0 && paths.length === 0) {
    return NextResponse.json(
      {
        code: 'INVALID_INPUT',
        message: 'Provide at least one cache tag or path.',
      },
      { status: 400 }
    )
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
