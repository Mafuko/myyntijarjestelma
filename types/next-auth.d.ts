import type { DefaultSession } from 'next-auth'

// Module augmentation for tokenVersion-based session revocation (see
// lib/auth.ts). `authorize()` attaches tokenVersion to the User it returns;
// the `jwt` callback stamps it onto the JWT and re-checks it against the
// database on every subsequent session check, so bumping a user's
// tokenVersion (e.g. an admin deactivating them) invalidates their
// already-issued session — not just future logins.
declare module 'next-auth' {
  interface User {
    tokenVersion: number
  }
  interface Session {
    user: DefaultSession['user'] & { id: string }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    tokenVersion?: number
  }
}
