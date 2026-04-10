import SiteShell from '@/components/SiteShell'

export default function FilmsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <SiteShell>{children}</SiteShell>
}
