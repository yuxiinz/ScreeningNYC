import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import EmailReminderToggle from '@/components/auth/EmailReminderToggle'
import LogoutButton from '@/components/auth/LogoutButton'
import { prisma } from '@/lib/prisma'

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(date)
}

const LINK_CARD_CLASS =
  'group block rounded-panel border border-border-default bg-card-bg p-5 shadow-card transition-colors hover:border-text-primary'

export default async function MePage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login?redirectTo=/me')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      createdAt: true,
      settings: {
        select: {
          watchlistEmailEnabled: true,
        },
      },
      accounts: {
        select: {
          provider: true,
        },
      },
      _count: {
        select: {
          watchlistItems: true,
          watchedMovies: true,
        },
      },
    },
  })

  if (!user) {
    redirect('/login?redirectTo=/me')
  }

  const linkedGoogle = user.accounts.some((account) => account.provider === 'google')

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <section className="mb-8">
        <h1 className="mb-2 text-[2.4rem] font-black leading-[1.05]">ME</h1>
        <p className="m-0 text-[0.98rem] leading-[1.6] text-text-secondary">
          Account and reminder settings live here. Want list and watched records now have dedicated pages from this dashboard.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <article className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="mb-1 text-[1.15rem] font-bold">Account</h2>
              <p className="m-0 text-[0.84rem] text-text-secondary">
                Signed in as {user.email}
              </p>
            </div>
            <LogoutButton />
          </div>

          <div className="space-y-3 text-[0.9rem] leading-[1.6] text-text-body">
            <p className="m-0">
              Name: {user.name || 'Not set'}
            </p>
            <p className="m-0">
              Password login: {user.emailVerified ? 'Verified' : 'Awaiting email verification'}
            </p>
            <p className="m-0">
              Google linked: {linkedGoogle ? 'Yes' : 'No'}
            </p>
            <p className="m-0">
              Member since: {formatDate(user.createdAt)}
            </p>
          </div>
        </article>

        <article className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card">
          <h2 className="mb-4 text-[1.15rem] font-bold">Email reminders</h2>
          <EmailReminderToggle
            initialEnabled={user.settings?.watchlistEmailEnabled ?? true}
          />
        </article>

        <Link href="/me/want-list" className={LINK_CARD_CLASS}>
          <h2 className="mb-4 text-[1.15rem] font-bold">
            Want to watch in theaters
          </h2>
          <p className="mb-2 text-[2rem] font-black">{user._count.watchlistItems}</p>
          <p className="m-0 text-[0.88rem] leading-[1.6] text-text-secondary group-hover:text-text-primary">
            Open your want list and see which picks are already on screen in NYC.
          </p>
        </Link>

        <Link href="/me/watched" className={LINK_CARD_CLASS}>
          <h2 className="mb-4 text-[1.15rem] font-bold">Watched / reviews</h2>
          <p className="mb-2 text-[2rem] font-black">{user._count.watchedMovies}</p>
          <p className="m-0 text-[0.88rem] leading-[1.6] text-text-secondary group-hover:text-text-primary">
            Open your watched list and manage the films you have already marked as seen.
          </p>
        </Link>
      </section>
    </main>
  )
}
