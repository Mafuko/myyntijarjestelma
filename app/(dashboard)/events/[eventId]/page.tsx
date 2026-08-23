import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { updateEvent } from '@/actions/events'

export default async function EventHomePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER', 'STAFF', 'ADMIN'])
  if (!authz.ok) redirect('/events')

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  const canManage = authz.role === 'ADMIN' || authz.role === 'OWNER'

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">{event.name}</h1>
      <nav className="mt-4 flex flex-col gap-2">
        <Link href={`/events/${eventId}/items`} className="underline">
          My items
        </Link>
        {(authz.role === 'STAFF' || canManage) && (
          <Link href={`/events/${eventId}/checkout`} className="underline">
            Checkout
          </Link>
        )}
        <Link href={`/events/${eventId}/sales`} className="underline">
          Sales
        </Link>
        {canManage && (
          <Link href={`/events/${eventId}/members`} className="underline">
            Members
          </Link>
        )}
      </nav>

      {canManage && (
        <form
          action={async (formData) => {
            'use server'
            await updateEvent(eventId, formData)
          }}
          className="mt-6 flex max-w-xs items-end gap-2"
        >
          <label className="flex flex-col gap-1 text-sm">
            Commission rate (0–1)
            <input
              name="commissionRate"
              type="number"
              step="0.01"
              min="0"
              max="1"
              defaultValue={event.commissionRate.toString()}
              className="rounded border px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded bg-black px-3 py-1.5 text-white">
            Update
          </button>
        </form>
      )}
    </div>
  )
}
