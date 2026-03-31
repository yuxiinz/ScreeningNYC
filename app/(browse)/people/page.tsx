import Link from 'next/link'

import DirectorSearchBox from '@/components/DirectorSearchBox'
import DirectorListActions from '@/components/person/DirectorListActions'
import PersonPhotoImage from '@/components/person/PersonPhotoImage'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import { prisma } from '@/lib/prisma'
import { getDirectorStatesForUser } from '@/lib/user-directors/service'

export const dynamic = 'force-dynamic'

export default async function PeoplePage() {
  const now = new Date()
  const [currentUserId, totalCount, linkedCount, people] = await Promise.all([
    getCurrentUserId(),
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
    prisma.person.findMany({
      select: {
        id: true,
        name: true,
        photoUrl: true,
      },
      orderBy: {
        name: 'asc',
      },
    }),
  ])
  const directorStates = await getDirectorStatesForUser(
    currentUserId,
    people.map((person) => person.id)
  )

  return (
    <>
      <div className="mx-auto mb-5 flex max-w-[var(--container-wide)] justify-end">
        <DirectorSearchBox isAuthenticated={Boolean(currentUserId)} />
      </div>

      <main className="mx-auto max-w-[var(--container-wide)]">
        <div className="mb-8">
          <p className="m-0 text-[0.98rem] leading-[1.5] text-text-primary">
            {totalCount} director{totalCount === 1 ? '' : 's'} in database, and{' '}
            {linkedCount} of them currently linked to on-screen films in the database.
          </p>
        </div>

        {people.length > 0 ? (
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {people.map((person) => (
              <article
                key={person.id}
                className="rounded-card border border-border-default bg-card-bg p-4 shadow-card transition-colors hover:border-border-strong"
              >
                <Link
                  href={`/people/${person.id}`}
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
                  <DirectorListActions
                    personId={person.id}
                    initialInWant={directorStates.get(person.id)?.inWant || false}
                    compact
                    className="mt-4"
                  />
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-text-empty">No directors available yet.</p>
        )}
      </main>
    </>
  )
}
