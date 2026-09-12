import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { listEventsForUser } from '@/lib/services/events'

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

  // An owner with no events yet has nothing to list — send them straight to
  // event creation instead of showing an empty page. Every other case
  // (owner with events, or any other role regardless of count) shows the
  // list below.
  if (user.isOwner && events.length === 0) redirect('/events/new')

  const t = await getTranslations('EventsPage')
  const tRoles = await getTranslations('Roles')

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
          {user.isOwner && (
            <Link href="/events/new" className="text-sm text-primary underline-offset-4 hover:underline">
              {t('newEvent')}
            </Link>
          )}
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="text-primary underline-offset-4 hover:underline">
                {e.name}
              </Link>{' '}
              <span className="text-muted-foreground">— {tRoles(e.role as 'SELLER' | 'STAFF' | 'ADMIN' | 'OWNER')}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
