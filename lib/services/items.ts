import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { writeAuditLog } from '@/lib/services/audit'
import { createItemSchema, updateItemSchema } from '@/lib/validation/item'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

export async function createItem(
  session: MinimalSession,
  eventId: string,
  input: unknown
): Promise<Result<{ itemId: string }>> {
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) return authz

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  if (new Date() > event.itemEditCutoffDate) {
    return { ok: false, error: { code: 'CUTOFF_PASSED', message: 'The item edit cutoff date has passed' } }
  }

  const parsed = createItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  const item = await prisma.item.create({
    data: { ...parsed.data, eventId, sellerId: authz.userId },
  })

  return { ok: true, data: { itemId: item.id } }
}

async function assertOwnsItemOrIsManager(
  session: MinimalSession,
  itemId: string
): Promise<Result<{ userId: string; role: string; item: { id: string; eventId: string; sellerId: string } }>> {
  const item = await prisma.item.findUnique({ where: { id: itemId } })
  if (!item) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }
  }

  const authz = await requireEventAccess(session, item.eventId, ['SELLER', 'ADMIN'])
  if (!authz.ok) return authz

  const isOwnItem = authz.role === 'SELLER' && item.sellerId === authz.userId
  const isManager = authz.role === 'ADMIN' || authz.role === 'OWNER'
  if (!isOwnItem && !isManager) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'You cannot modify this item' } }
  }

  return { ok: true, data: { userId: authz.userId, role: authz.role, item } }
}

export async function updateItem(session: MinimalSession, itemId: string, input: unknown): Promise<Result<{ itemId: string }>> {
  const access = await assertOwnsItemOrIsManager(session, itemId)
  if (!access.ok) return access

  const event = await prisma.event.findUniqueOrThrow({ where: { id: access.data.item.eventId } })
  const isManager = access.data.role === 'ADMIN' || access.data.role === 'OWNER'
  if (!isManager && new Date() > event.itemEditCutoffDate) {
    return { ok: false, error: { code: 'CUTOFF_PASSED', message: 'The item edit cutoff date has passed' } }
  }

  const parsed = updateItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  await prisma.item.update({ where: { id: itemId }, data: parsed.data })
  return { ok: true, data: { itemId } }
}

export async function deleteItem(session: MinimalSession, itemId: string): Promise<Result<{ itemId: string }>> {
  const access = await assertOwnsItemOrIsManager(session, itemId)
  if (!access.ok) return access

  await prisma.item.update({ where: { id: itemId }, data: { status: 'REMOVED' } })

  const isOwnItem = access.data.role === 'SELLER' && access.data.item.sellerId === access.data.userId
  if (!isOwnItem) {
    await writeAuditLog({
      actorUserId: access.data.userId,
      action: 'ITEM_DELETED_BY_ADMIN',
      targetType: 'Item',
      targetId: itemId,
      metadata: { sellerId: access.data.item.sellerId },
    })
  }

  return { ok: true, data: { itemId } }
}

export async function listItemsForSeller(session: MinimalSession, eventId: string): Promise<Result<Array<{ id: string; name: string; price: string; status: string }>>> {
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) return authz

  const items = await prisma.item.findMany({
    where: { eventId, sellerId: authz.userId, status: { not: 'REMOVED' } },
    orderBy: { createdAt: 'desc' },
  })

  return { ok: true, data: items.map((i) => ({ id: i.id, name: i.name, price: i.price.toString(), status: i.status })) }
}

export async function listAllItemsForEvent(session: MinimalSession, eventId: string): Promise<Result<Array<{ id: string; name: string; price: string; status: string; sellerId: string }>>> {
  const authz = await requireEventAccess(session, eventId, ['STAFF', 'ADMIN'])
  if (!authz.ok) return authz

  const items = await prisma.item.findMany({
    where: { eventId, status: { not: 'REMOVED' } },
    orderBy: { createdAt: 'desc' },
  })

  return {
    ok: true,
    data: items.map((i) => ({ id: i.id, name: i.name, price: i.price.toString(), status: i.status, sellerId: i.sellerId })),
  }
}
