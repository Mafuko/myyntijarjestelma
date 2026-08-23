import type { NextAuthConfig } from 'next-auth'

// Edge-safe subset of the NextAuth config: no providers, no Node-only
// dependencies (Prisma adapter, @node-rs/argon2, etc). middleware.ts runs on
// the Edge runtime and imports only this file, so it never pulls native
// bindings into its bundle. lib/auth.ts spreads this config and adds the
// full (Node-only) provider/adapter setup for use in Server Actions and
// route handlers.
export const authConfig = {
  pages: { signIn: '/login' },
  providers: [],
} satisfies NextAuthConfig
