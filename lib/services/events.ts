import { prisma } from '@/lib/db'
import { requireOwner, requireEventAccess } from '@/lib/services/authz'
import { writeAuditLog } from '@/lib/services/audit'
import { inviteUser } from '@/lib/services/users'
import { createEventSchema, updateEventSchema } from '@/lib/validation/event'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

const DEFAULT_CATEGORIES = ['Vaatteet', 'Kirjat ja lehdet', 'Lelut', 'Elektroniikka', 'Kodintavarat', 'Muu']

export async function createEvent(session: MinimalSession, input: unknown): Promise<Result<{ eventId: string }>> {
  const authz = await requireOwner(session)
  if (!authz.ok) return authz

  const parsed = createEventSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({ data: { ...parsed.data, createdByUserId: authz.userId } })

    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((name) => ({ eventId: created.id, name })),
    })

    return created
  })

  await writeAuditLog({
    actorUserId: authz.userId,
    action: 'EVENT_CREATED',
    targetType: 'Event',
    targetId: event.id,
    metadata: { name: event.name },
  })

  return { ok: true, data: { eventId: event.id } }
}

export async function updateEvent(
  session: MinimalSession,
  eventId: string,
  input: unknown
): Promise<Result<{ eventId: string }>> {
  const authz = await requireEventAccess(session, eventId, ['ADMIN'])
  if (!authz.ok) return authz

  const parsed = updateEventSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  const before = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  const event = await prisma.event.update({ where: { id: eventId }, data: parsed.data })

  if (parsed.data.commissionRate !== undefined && !before.commissionRate.equals(event.commissionRate)) {
    await writeAuditLog({
      actorUserId: authz.userId,
      action: 'EVENT_COMMISSION_RATE_CHANGED',
      targetType: 'Event',
      targetId: eventId,
      metadata: { from: before.commissionRate.toString(), to: event.commissionRate.toString() },
    })
  }

  return { ok: true, data: { eventId: event.id } }
}

export async function listEventsForUser(
  userId: string
): Promise<Array<{ id: string; name: string; eventDate: Date; role: string }>> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  if (user.isOwner) {
    const events = await prisma.event.findMany({ orderBy: { eventDate: 'desc' } })
    return events.map((e) => ({ id: e.id, name: e.name, eventDate: e.eventDate, role: 'OWNER' }))
  }

  const memberships = await prisma.eventMembership.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { event: true },
    orderBy: { event: { eventDate: 'desc' } },
  })
  return memberships.map((m) => ({ id: m.event.id, name: m.event.name, eventDate: m.event.eventDate, role: m.role }))
}

export async function inviteMemberToEvent(
  session: MinimalSession,
  input: { name: string; email: string; role: 'SELLER' | 'STAFF' | 'ADMIN'; eventId: string; sellerAlias?: string }
): Promise<Result<{ inviteUrl: string | null }>> {
  const authz = await requireEventAccess(session, input.eventId, ['ADMIN'])
  if (!authz.ok) return authz

  const result = await inviteUser(input)
  if (!result.ok) return result

  await writeAuditLog({
    actorUserId: authz.userId,
    action: 'MEMBER_INVITED',
    targetType: 'Event',
    targetId: input.eventId,
    metadata: { invitedEmail: input.email, role: input.role },
  })

  return result
}
