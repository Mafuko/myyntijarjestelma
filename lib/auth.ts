import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/crypto'
import { loginSchema } from '@/lib/validation/user'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  pages: { signIn: '/login' },
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

        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  ],
})
