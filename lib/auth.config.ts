import type { NextAuthConfig } from 'next-auth'

// Edge-safe subset of the NextAuth config: no providers, no Node-only
// dependencies (Prisma adapter, @node-rs/argon2, etc). middleware.ts runs on
// the Edge runtime and imports only this file, so it never pulls native
// bindings into its bundle. lib/auth.ts spreads this config and adds the
// full (Node-only) provider/adapter setup for use in Server Actions and
// route handlers.
//
// Consequence: this config has no `jwt`/`session` callbacks, so
// middleware's presence check (`!!req.auth`) cannot see database-backed
// session revocation (tokenVersion, see lib/auth.ts) — the Edge runtime
// can't run Prisma queries. Middleware only guarantees "some session cookie
// exists"; the authoritative, revocation-aware check happens wherever
// lib/auth.ts's `auth()` is called (Server Components, Server Actions),
// e.g. app/(dashboard)/events/page.tsx.
export const authConfig = {
  pages: { signIn: '/login' },
  providers: [],
} satisfies NextAuthConfig
