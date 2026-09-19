import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/lib/auth.config'

// Uses the edge-safe authConfig (not lib/auth.ts) so this Edge-runtime
// middleware never bundles Node-only dependencies (Prisma adapter,
// @node-rs/argon2) that the full auth config pulls in via the Credentials
// provider's authorize() closure.
const { auth } = NextAuth(authConfig)

// script-src allows 'unsafe-inline' because Next.js injects inline
// hydration data; a stricter nonce-based CSP is a hardening follow-up
// planned for Session 10, not an oversight. In development, Next.js's
// Fast Refresh/HMR runtime also relies on eval(), so 'unsafe-eval' is
// added only when NODE_ENV === 'development' — production responses
// never receive it.
const scriptSrc = `'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy': `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'`,
}

// The price-tag preview page embeds this route's own PDF response in a
// same-origin <iframe> -- the blanket DENY/'none' above silently blocks
// that embed even though nothing cross-origin is involved. Carve out
// same-origin framing for this one path only; every other route keeps
// the stricter defaults untouched.
const PRICE_TAG_FRAME_HEADERS: Record<string, string> = {
  ...SECURITY_HEADERS,
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': SECURITY_HEADERS['Content-Security-Policy'].replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
}

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isProtectedRoute = req.nextUrl.pathname.startsWith('/events')

  const response =
    isProtectedRoute && !isLoggedIn
      ? NextResponse.redirect(new URL('/login', req.nextUrl))
      : NextResponse.next()

  const headers = req.nextUrl.pathname.startsWith('/api/price-tags/') ? PRICE_TAG_FRAME_HEADERS : SECURITY_HEADERS
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value)
  }
  return response
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
