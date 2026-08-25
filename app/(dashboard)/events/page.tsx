import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { listEventsForUser } from '@/lib/services/events'
import { CreateEventForm } from './CreateEventForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function EventsPage() {
  const session = await auth()
  // middleware.ts only checks that a session cookie decodes (it runs on the
  // Edge runtime, which can't reach the database to check tokenVersion — see
  // lib/auth.config.ts). This is the authoritative check: lib/auth.ts's jwt
  // callback re-validates tokenVersion against the database on every call,
  // so a revoked session (cookie still present, but tokenVersion bumped)
  // lands here as session === null and must be redirected explicitly.
  if (!session?.user) redirect('/login')

  const events = await listEventsForUser(session.user.id)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Events</h1>
        <ul className="mt-4 flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="text-primary underline-offset-4 hover:underline">
                {e.name}
              </Link>{' '}
              <span className="text-muted-foreground">— {e.role}</span>
            </li>
          ))}
        </ul>
      </div>

      {user.isOwner && (
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Create event</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateEventForm />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
