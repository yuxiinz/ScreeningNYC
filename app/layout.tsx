import type { Metadata } from 'next'
import './globals.css'

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
      <body className="flex min-h-full flex-col bg-page-bg font-sans text-text-primary">
        {children}
      </body>
    </html>
  )
}
