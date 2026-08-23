import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/lib/auth.config'

// Uses the edge-safe authConfig (not lib/auth.ts) so this Edge-runtime
// middleware never bundles Node-only dependencies (Prisma adapter,
// @node-rs/argon2) that the full auth config pulls in via the Credentials
// provider's authorize() closure.
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isProtectedRoute = req.nextUrl.pathname.startsWith('/events')
  if (isProtectedRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }
})

export const config = {
  matcher: ['/events/:path*'],
}
