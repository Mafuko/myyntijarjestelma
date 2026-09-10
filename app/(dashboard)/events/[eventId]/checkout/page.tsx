import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { listAllItemsForEvent } from '@/lib/services/items'
import { CheckoutTabs } from './CheckoutTabs'

export default async function CheckoutPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['STAFF', 'ADMIN'])
  if (!authz.ok) redirect('/events')

  const [itemsResult, memberships] = await Promise.all([
    listAllItemsForEvent(session, eventId),
    prisma.eventMembership.findMany({
      where: { eventId },
      select: { userId: true, sellerAlias: true, user: { select: { name: true } } },
    }),
  ])
  const items = itemsResult.ok ? itemsResult.data : []
  const sellers = memberships.map((m) => ({ userId: m.userId, label: m.sellerAlias ?? m.user.name }))

  return <CheckoutTabs eventId={eventId} items={items} sellers={sellers} />
}
