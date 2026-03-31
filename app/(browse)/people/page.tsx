import Link from 'next/link'

import DirectorSearchBox from '@/components/DirectorSearchBox'
import { getCurrentUserId } from '@/lib/auth/require-user-id'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function PeoplePage() {
  const [currentUserId, people] = await Promise.all([
    getCurrentUserId(),
    prisma.person.findMany({
      where: {
        movieLinks: {
          some: {
            kind: 'DIRECTOR',
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    }),
  ])

  return (
    <>
      <div className="mx-auto mb-5 flex max-w-[var(--container-wide)] justify-end">
        <DirectorSearchBox isAuthenticated={Boolean(currentUserId)} />
      </div>

      <main className="mx-auto max-w-[var(--container-wide)]">
        <div className="mb-8">
          <p className="m-0 text-[0.98rem] leading-[1.5] text-text-primary">
            {people.length} director{people.length === 1 ? '' : 's'} currently linked
            to films in the database.
          </p>
        </div>

        {people.length > 0 ? (
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {people.map((person) => (
              <Link
                key={person.id}
                href={`/people/${person.id}`}
                className="block rounded-card border border-border-default bg-card-bg px-5 py-4 text-inherit no-underline transition-colors hover:border-border-strong"
              >
                <article className="min-h-[112px]">
                  <h2 className="m-0 mb-3 text-[1.05rem] font-bold leading-[1.3] text-text-primary">
                    {person.name}
                  </h2>

                  <p className="m-0 text-[0.85rem] leading-[1.45] text-text-tertiary">
                    Director
                  </p>
                </article>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-text-empty">No directors available yet.</p>
        )}
      </main>
    </>
  )
}
