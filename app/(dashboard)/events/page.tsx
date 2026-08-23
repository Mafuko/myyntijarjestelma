import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { listEventsForUser } from '@/lib/services/events'
import { createEvent } from '@/actions/events'

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
    <div className="p-8">
      <h1 className="text-xl font-semibold">Events</h1>
      <p>Signed in as {session.user.email}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {events.map((e) => (
          <li key={e.id}>
            <Link href={`/events/${e.id}`} className="underline">
              {e.name}
            </Link>{' '}
            — {e.role}
          </li>
        ))}
      </ul>

      {user.isOwner && (
        <form
          action={async (formData) => {
            'use server'
            await createEvent(formData)
          }}
          className="mt-8 flex max-w-sm flex-col gap-3"
        >
          <h2 className="font-medium">Create event</h2>
          <input name="name" placeholder="Event name" required className="rounded border px-2 py-1" />
          <label className="flex flex-col gap-1 text-sm">
            Event date
            <input name="eventDate" type="date" required className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Registration deadline
            <input name="registrationDeadline" type="date" required className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Item edit cutoff
            <input name="itemEditCutoffDate" type="date" required className="rounded border px-2 py-1" />
          </label>
          <button type="submit" className="rounded bg-black px-4 py-2 text-white">
            Create event
          </button>
        </form>
      )}
    </div>
  )
}
