import Header from '@/components/Header'

export default function BrowseLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div
      style={{
        backgroundColor: '#0a0a0a',
        color: '#fff',
        minHeight: '100vh',
        padding: '40px 20px',
      }}
    >
      <Header />
      {children}
    </div>
  )
}
