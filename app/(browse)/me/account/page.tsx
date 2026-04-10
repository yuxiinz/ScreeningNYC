import Link from 'next/link'
import { redirect } from 'next/navigation'

import AccountProfileForm from '@/components/auth/AccountProfileForm'
import PasswordChangeForm from '@/components/auth/PasswordChangeForm'
import { requireUserIdForPage } from '@/lib/auth/require-user-id'
import { prisma } from '@/lib/prisma'

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(date)
}

export default async function AccountSettingsPage() {
  const userId = await requireUserIdForPage('/me/account')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      passwordHash: true,
      emailVerified: true,
      createdAt: true,
      accounts: {
        select: {
          provider: true,
        },
      },
    },
  })

  if (!user) {
    redirect('/login?redirectTo=/me/account')
  }

  const linkedGoogle = user.accounts.some((account) => account.provider === 'google')

  return (
    <main className="mx-auto max-w-[var(--container-main)]">
      <section className="mb-8">
        <p className="mb-3 text-[0.82rem] font-semibold tracking-[0.12em] text-text-dim">
          <Link href="/me" className="hover:text-text-primary">
            ME
          </Link>{' '}
          / ACCOUNT
        </p>
        <h1 className="mb-2 text-[2.4rem] font-black leading-[1.05]">ACCOUNT</h1>
        <p className="m-0 max-w-[720px] text-[0.98rem] leading-[1.6] text-text-secondary">
          Update the parts of your account that can change.
        </p>
      </section>

      <article className="rounded-panel border border-border-default bg-card-bg p-5 shadow-card">
        <div className="mb-5">
          <h2 className="mb-1 text-[1.15rem] font-bold">Account</h2>
          <p className="m-0 text-[0.84rem] text-text-secondary">
            Signed in as {user.email}
          </p>
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

        <div className="my-6 h-px bg-border-subtle" />

        <section className="max-w-[720px]">
          <h3 className="mb-4 text-[1rem] font-bold">Name</h3>
          <AccountProfileForm initialName={user.name || ''} />
        </section>

        <div className="my-6 h-px bg-border-subtle" />

        <section className="max-w-[720px]">
          <div className="mb-4">
            <h3 className="mb-1 text-[1rem] font-bold">Password</h3>
            <p className="m-0 text-[0.84rem] text-text-secondary">
              {user.emailVerified
                ? 'Change the password used for email login.'
                : 'Password login will work after email verification.'}
            </p>
          </div>
          <PasswordChangeForm initialHasPassword={Boolean(user.passwordHash)} />
        </section>
      </article>
    </main>
  )
}
