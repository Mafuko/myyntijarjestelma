import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/crypto'
import { loginSchema } from '@/lib/validation/user'
import { authConfig } from '@/lib/auth.config'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  // The Credentials provider only supports the JWT session strategy —
  // Auth.js throws UnsupportedStrategy at sign-in time otherwise, since
  // credentials sign-in has no OAuth-style account-linking flow for the
  // adapter to persist a database session against.
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw)
        if (!parsed.success) return null

        const { email, password } = parsed.data
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.passwordHash) return null

        const valid = await verifyPassword(user.passwordHash, password)
        if (!valid) return null

        return { id: user.id, name: user.name, email: user.email, tokenVersion: user.tokenVersion }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Initial sign-in: `user` is what authorize() returned above.
        // Stamp the id and the tokenVersion current as of this sign-in.
        token.sub = user.id
        token.tokenVersion = user.tokenVersion
        return token
      }

      // Every subsequent session check (every `auth()` call): re-fetch the
      // user's CURRENT tokenVersion from the database and compare it to
      // what was stamped on the token at sign-in. If an admin has since
      // bumped it (e.g. deactivating this user), or the user no longer
      // exists, the already-issued JWT must stop being honored.
      //
      // Returning `null` here is the documented way to invalidate a JWT
      // session in Auth.js: the `jwt` callback's return type is
      // `Awaitable<JWT | null>` (@auth/core/src/index.ts), and
      // @auth/core's session action (lib/actions/session.ts) skips the
      // `session` callback entirely, clears the session cookie, and
      // returns no session whenever `jwt()` returns null — verified by
      // reading that source directly, not assumed.
      const dbUser = token.sub ? await prisma.user.findUnique({ where: { id: token.sub } }) : null
      if (!dbUser || dbUser.tokenVersion !== token.tokenVersion) return null

      return token
    },
    session({ session, token }) {
      session.user.id = token.sub as string
      return session
    },
  },
})
