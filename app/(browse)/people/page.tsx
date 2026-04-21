import Link from 'next/link'

import BackToTopButton from '@/components/BackToTopButton'
import PersonSearchBox from '@/components/PersonSearchBox'
import PaginationControls from '@/components/PaginationControls'
import PersonListActions from '@/components/person/PersonListActions'
import PersonPhotoImage from '@/components/person/PersonPhotoImage'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import { prisma } from '@/lib/prisma'
import { parsePositivePage } from '@/lib/routing/search-params'
import { getPersonStatesForUser } from '@/lib/user-people/service'

const PEOPLE_PAGE_SIZE = 120

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const currentPage = parsePositivePage(params.page)
  const currentUserId = await getCurrentUserId()
  const now = new Date()
  const [totalCount, linkedCount] = await Promise.all([
    prisma.person.count(),
    prisma.person.count({
      where: {
        movieLinks: {
          some: {
            kind: 'DIRECTOR',
            movie: {
              showtimes: {
                some: {
                  startTime: {
                    gt: now,
                  },
                  status: 'SCHEDULED',
                },
              },
            },
          },
        },
      },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(totalCount / PEOPLE_PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const skip = (safePage - 1) * PEOPLE_PAGE_SIZE

  const people = await prisma.person.findMany({
    select: {
      id: true,
      name: true,
      photoUrl: true,
    },
    orderBy: {
      name: 'asc',
    },
    skip,
    take: PEOPLE_PAGE_SIZE,
  })

  const directorStates = await getPersonStatesForUser(
    currentUserId,
    people.map((person) => person.id)
  )
  const startIndex = totalCount === 0 ? 0 : skip + 1
  const endIndex = Math.min(skip + people.length, totalCount)

  return (
    <>
      <div className="mx-auto mb-5 flex max-w-[var(--container-wide)] justify-end">
        <PersonSearchBox isAuthenticated={Boolean(currentUserId)} />
      </div>

      <main className="mx-auto max-w-[var(--container-wide)]">
        <div className="mb-8">
          <p className="m-0 text-[0.98rem] leading-[1.5] text-text-primary">
            {totalCount} director{totalCount === 1 ? '' : 's'} in database, and{' '}
            {linkedCount} of them currently linked to on-screen films in the database.
          </p>
          <p className="m-0 mt-2 text-[0.88rem] leading-[1.5] text-text-muted">
            Showing {startIndex}-{endIndex} of {totalCount}.
          </p>
        </div>

        {people.length > 0 ? (
          <>
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
              {people.map((person) => (
                <article
                  key={person.id}
                  className="rounded-card border border-border-default bg-card-bg p-4 shadow-card transition-colors hover:border-border-strong"
                >
                  <Link
                    href={`/people/${person.id}`}
                    prefetch={false}
                    className="block text-inherit no-underline"
                  >
                    <div className="mb-4 aspect-[4/5] overflow-hidden rounded-card border border-border-subtle bg-page-bg">
                      <PersonPhotoImage
                        src={person.photoUrl || ''}
                        alt={person.name}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <h2 className="m-0 text-[1.02rem] font-bold leading-[1.3] text-text-primary">
                      {person.name}
                    </h2>
                  </Link>

                  {currentUserId ? (
                    <PersonListActions
                      personId={person.id}
                      initialInWant={directorStates.get(person.id)?.inWant || false}
                      compact
                      className="mt-4"
                    />
                  ) : null}
                </article>
              ))}
            </div>

            <PaginationControls currentPage={safePage} totalPages={totalPages} />
          </>
        ) : (
          <p className="text-text-empty">No directors available yet.</p>
        )}
      </main>

      <BackToTopButton />
    </>
  )
}
