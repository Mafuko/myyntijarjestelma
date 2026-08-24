import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

export type SalesSnapshotItem = { id: string; name: string; price: string; status: string; sellerAlias: string }
export type SalesSnapshot = { items: SalesSnapshotItem[]; totalRevenue: string; commissionOwed: string }

export async function getSalesSnapshot(session: MinimalSession, eventId: string): Promise<Result<SalesSnapshot>> {
  const authz = await requireEventAccess(session, eventId, ['SELLER', 'STAFF', 'ADMIN'])
  if (!authz.ok) return authz

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  const isManager = authz.role === 'STAFF' || authz.role === 'ADMIN' || authz.role === 'OWNER'

  const items = await prisma.item.findMany({
    where: {
      eventId,
      status: { not: 'REMOVED' },
      ...(isManager ? {} : { sellerId: authz.userId }),
    },
  })

  const memberships = await prisma.eventMembership.findMany({ where: { eventId } })
  const aliasBySellerId = new Map(memberships.map((m) => [m.userId, m.sellerAlias ?? 'Unknown']))

  const soldItems = items.filter((i) => i.status === 'SOLD')
  const totalRevenue = soldItems.reduce((sum, i) => sum.add(i.price), new Prisma.Decimal(0))
  const commissionOwed = totalRevenue.mul(event.commissionRate)

  return {
    ok: true,
    data: {
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price.toString(),
        status: i.status,
        sellerAlias: aliasBySellerId.get(i.sellerId) ?? 'Unknown',
      })),
      totalRevenue: totalRevenue.toFixed(2),
      commissionOwed: commissionOwed.toFixed(2),
    },
  }
}
