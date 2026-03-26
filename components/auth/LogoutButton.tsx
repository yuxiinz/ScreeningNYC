'use client'

import { signOut } from 'next-auth/react'

export default function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectTo: '/' })}
      className="rounded-panel border border-border-input px-4 py-2 text-[0.82rem] font-semibold text-text-primary transition-colors hover:border-text-primary"
    >
      Sign out
    </button>
  )
}
