import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { SignupForm } from './SignupForm'

// Without this, Next.js has no recognized "dynamic API" signal on this page
// (a plain prisma.user.count() doesn't count, unlike cookies()/headers()) and
// statically prerenders it at build time — baking in whatever user count the
// build happened to see and never re-checking it again in production. The
// whole point of this route is a fresh per-request check, so it must never
// be static.
export const dynamic = 'force-dynamic'

export default async function SignupPage() {
  const userCount = await prisma.user.count()
  if (userCount > 0) redirect('/login')

  return <SignupForm />
}
