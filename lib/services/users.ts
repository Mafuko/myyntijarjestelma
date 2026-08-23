import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/crypto'
import { inviteUserSchema, acceptInviteSchema } from '@/lib/validation/user'
import { requireOwner } from '@/lib/services/authz'
import { writeAuditLog } from '@/lib/services/audit'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

export async function inviteUser(input: unknown): Promise<Result<{ inviteUrl: string | null }>> {
  const parsed = inviteUserSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }
  const { name, email, role, eventId, sellerAlias } = parsed.data

  let user = await prisma.user.findUnique({ where: { email } })
  let inviteUrl: string | null = null

  if (!user) {
    const inviteToken = randomBytes(24).toString('hex')
    user = await prisma.user.create({ data: { name, email, inviteToken } })
    inviteUrl = `/invite/${inviteToken}`
  } else if (!user.passwordHash) {
    const inviteToken = user.inviteToken ?? randomBytes(24).toString('hex')
    if (inviteToken !== user.inviteToken) {
      user = await prisma.user.update({ where: { id: user.id }, data: { inviteToken } })
    }
    inviteUrl = `/invite/${inviteToken}`
  }

  const existingMembership = await prisma.eventMembership.findUnique({
    where: { userId_eventId: { userId: user.id, eventId } },
  })
  if (existingMembership) {
    return { ok: false, error: { code: 'ALREADY_MEMBER', message: 'User already has a role in this event' } }
  }

  await prisma.eventMembership.create({
    data: {
      userId: user.id,
      eventId,
      role,
      sellerAlias,
      status: user.passwordHash ? 'ACTIVE' : 'PENDING',
    },
  })

  return { ok: true, data: { inviteUrl } }
}

export async function activateInvite(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = acceptInviteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }
  const { token, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { inviteToken: token } })
  if (!user) {
    return { ok: false, error: { code: 'INVALID_TOKEN', message: 'Invite link is invalid or already used' } }
  }

  const passwordHash = await hashPassword(password)

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, inviteToken: null } }),
    prisma.eventMembership.updateMany({
      where: { userId: user.id, status: 'PENDING' },
      data: { status: 'ACTIVE' },
    }),
  ])

  return { ok: true, data: { userId: user.id } }
}

export async function deleteUserPii(session: MinimalSession, targetUserId: string): Promise<Result<{}>> {
  const authz = await requireOwner(session)
  if (!authz.ok) return authz

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      name: 'Deleted user',
      email: `deleted-${targetUserId}@deleted.local`,
      phone: null,
      ibanCiphertext: null,
      payoutMethod: null,
      passwordHash: null,
      inviteToken: null,
      tokenVersion: { increment: 1 },
    },
  })

  await writeAuditLog({
    actorUserId: authz.userId,
    action: 'USER_PII_DELETED',
    targetType: 'User',
    targetId: targetUserId,
  })

  return { ok: true, data: {} }
}
