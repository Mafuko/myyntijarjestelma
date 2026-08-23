import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export default async function EventsPage() {
  const session = await auth()
  // middleware.ts only checks that a session cookie decodes (it runs on the
  // Edge runtime, which can't reach the database to check tokenVersion — see
  // lib/auth.config.ts). This is the authoritative check: lib/auth.ts's jwt
  // callback re-validates tokenVersion against the database on every call,
  // so a revoked session (cookie still present, but tokenVersion bumped)
  // lands here as session === null and must be redirected explicitly.
  if (!session?.user) redirect('/login')

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Events</h1>
      <p>Signed in as {session.user.email}</p>
    </div>
  )
}
