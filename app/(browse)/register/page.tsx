import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import RegisterForm from '@/components/auth/RegisterForm'

export default async function RegisterPage() {
  const session = await auth()

  if (session?.user) {
    redirect('/me')
  }

  return (
    <main className="mx-auto max-w-[560px]">
      <RegisterForm />
    </main>
  )
}
