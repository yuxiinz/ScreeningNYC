import Header from '@/components/Header'

export default function BrowseLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen bg-page-bg px-5 py-10 text-text-primary">
      <Header />
      {children}
    </div>
  )
}
