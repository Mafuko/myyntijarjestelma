import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { UpdateCommissionForm } from './UpdateCommissionForm'

export default async function EventHomePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER', 'STAFF', 'ADMIN'])
  if (!authz.ok) redirect('/events')

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  const canManage = authz.role === 'ADMIN' || authz.role === 'OWNER'
  const navLinkClass = 'text-primary underline-offset-4 hover:underline'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">{event.name}</h1>
      <nav className="flex flex-col gap-2">
        <Link href={`/events/${eventId}/items`} className={navLinkClass}>
          My items
        </Link>
        {(authz.role === 'STAFF' || canManage) && (
          <Link href={`/events/${eventId}/checkout`} className={navLinkClass}>
            Checkout
          </Link>
        )}
        <Link href={`/events/${eventId}/sales`} className={navLinkClass}>
          Sales
        </Link>
        {canManage && (
          <Link href={`/events/${eventId}/members`} className={navLinkClass}>
            Members
          </Link>
        )}
      </nav>

      {canManage && <UpdateCommissionForm eventId={eventId} commissionRate={event.commissionRate.toString()} />}
    </div>
  )
}
