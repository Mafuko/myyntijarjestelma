import { prisma } from '@/lib/db'

export type Role = 'SELLER' | 'STAFF' | 'ADMIN'

export type AuthzResult =
  | { ok: true; userId: string; role: Role | 'OWNER' }
  | { ok: false; error: { code: 'UNAUTHENTICATED' | 'FORBIDDEN'; message: string } }

type MinimalSession = { user?: { id?: string | null } | null } | null

async function getUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } })
}

export async function requireEventAccess(
  session: MinimalSession,
  eventId: string,
  allowedRoles: Role[]
): Promise<AuthzResult> {
  const userId = session?.user?.id
  if (!userId) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }
  }

  const user = await getUser(userId)
  if (user?.isOwner) {
    return { ok: true, userId, role: 'OWNER' }
  }

  const membership = await prisma.eventMembership.findUnique({
    where: { userId_eventId: { userId, eventId } },
  })
  if (!membership || membership.status !== 'ACTIVE' || !allowedRoles.includes(membership.role)) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'You do not have access to this event' } }
  }

  return { ok: true, userId, role: membership.role }
}

export async function requireOwner(session: MinimalSession): Promise<AuthzResult> {
  const userId = session?.user?.id
  if (!userId) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }
  }
  const user = await getUser(userId)
  if (!user?.isOwner) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Only the site owner can perform this action' } }
  }
  return { ok: true, userId, role: 'OWNER' }
}
