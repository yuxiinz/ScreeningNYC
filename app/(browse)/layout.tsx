import { connection } from 'next/server'

import { auth } from '@/auth'
import Header from '@/components/Header'

export default async function BrowseLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await connection()

  const session = await auth()
  const isAuthenticated = Boolean(session?.user?.id)

  return (
    <div className="min-h-screen bg-page-bg px-5 py-10 text-text-primary">
      <Header
        accountHref={isAuthenticated ? '/me' : '/login'}
        accountLabel={isAuthenticated ? 'ME' : 'LOGIN'}
        accountActivePrefixes={
          isAuthenticated ? ['/me'] : ['/login', '/register', '/verify-email']
        }
      />
      {children}
    </div>
  )
}
