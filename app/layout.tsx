import type { Metadata } from 'next'
import { Suspense } from 'react'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  title: 'Screening NYC',
  description: 'Find indie films in NYC',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <Suspense fallback={null}>
        <body className="flex min-h-full flex-col bg-page-bg font-sans text-text-primary">
          {children}
          <Analytics />
        </body>
      </Suspense>
    </html>
  )
}
