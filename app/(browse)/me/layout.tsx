import { connection } from 'next/server'

export default async function MeLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await connection()

  return children
}
