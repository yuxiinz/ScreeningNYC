import { PrismaAdapter } from '@auth/prisma-adapter'
import NextAuth, { CredentialsSignin, type NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'

import { authEnv, isGoogleAuthConfigured, isMagicLinkConfigured } from '@/lib/auth/env'
import { verifyPassword } from '@/lib/auth/password'
import { ensureUserSettings, findAuthUserByEmail, normalizeEmail } from '@/lib/auth/users'
import { prisma } from '@/lib/prisma'

class InvalidCredentialsError extends CredentialsSignin {
  code = 'invalid_credentials'
}

class EmailNotVerifiedError extends CredentialsSignin {
  code = 'email_not_verified'
}

const providers: NonNullable<NextAuthConfig['providers']> = []

providers.push(
  Credentials({
    credentials: {
      email: {
        label: 'Email',
        type: 'email',
      },
      password: {
        label: 'Password',
        type: 'password',
      },
    },
    authorize: async (credentials) => {
      const email =
        typeof credentials?.email === 'string'
          ? normalizeEmail(credentials.email)
          : ''
      const password =
        typeof credentials?.password === 'string' ? credentials.password : ''

      if (!email || !password) {
        throw new InvalidCredentialsError()
      }

      const user = await findAuthUserByEmail(email)

      if (!user?.passwordHash) {
        throw new InvalidCredentialsError()
      }

      if (!user.emailVerified) {
        throw new EmailNotVerifiedError()
      }

      const passwordMatches = await verifyPassword(password, user.passwordHash)

      if (!passwordMatches) {
        throw new InvalidCredentialsError()
      }

      await ensureUserSettings(user.id)

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        emailVerified: user.emailVerified,
      }
    },
  })
)

if (isMagicLinkConfigured()) {
  providers.unshift(
    Resend({
      apiKey: authEnv.resendApiKey,
      from: authEnv.emailFrom,
    })
  )
}

if (isGoogleAuthConfigured()) {
  providers.unshift(
    Google({
      clientId: authEnv.googleClientId,
      clientSecret: authEnv.googleClientSecret,
    })
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: authEnv.secret,
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  providers,
  callbacks: {
    async signIn({ user }) {
      if (user.id) {
        await ensureUserSettings(user.id)
      }

      return true
    },
    async jwt({ token, user }) {
      if (user && 'emailVerified' in user) {
        token.emailVerified =
          user.emailVerified instanceof Date
            ? user.emailVerified.toISOString()
            : typeof user.emailVerified === 'string'
              ? user.emailVerified
              : null
      } else if (user) {
        token.emailVerified = null
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || ''
        session.user.emailVerified =
          typeof token.emailVerified === 'string'
            ? new Date(token.emailVerified)
            : null
      }

      return session
    },
  },
})
