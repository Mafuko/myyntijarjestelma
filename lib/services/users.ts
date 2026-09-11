import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/crypto'
import { inviteUserSchema, acceptInviteSchema, signupSchema } from '@/lib/validation/user'
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

const ALREADY_INITIALIZED_ERROR = { code: 'ALREADY_INITIALIZED', message: 'Setup has already been completed' } as const

export async function bootstrapOwner(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }
  const { name, email, password } = parsed.data

  try {
    const userId = await prisma.$transaction(
      async (tx) => {
        // Serializable isolation, re-checked inside the transaction rather
        // than trusting a check made before calling this function: two
        // concurrent callers could otherwise both observe zero users and
        // both create an owner. Under Serializable, Postgres detects that
        // write skew and aborts the loser's COMMIT with a serialization
        // failure (caught below as Prisma's P2034), so only one owner is
        // ever created no matter how the two calls interleave.
        const existingCount = await tx.user.count()
        if (existingCount > 0) {
          throw new AlreadyInitializedError()
        }
        const passwordHash = await hashPassword(password)
        const user = await tx.user.create({ data: { name, email, passwordHash, isOwner: true } })
        return user.id
      },
      { isolationLevel: 'Serializable' }
    )
    return { ok: true, data: { userId } }
  } catch (err) {
    if (err instanceof AlreadyInitializedError) {
      return { ok: false, error: ALREADY_INITIALIZED_ERROR }
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      return { ok: false, error: ALREADY_INITIALIZED_ERROR }
    }
    throw err
  }
}

class AlreadyInitializedError extends Error {}

export async function updateUserLocale(userId: string, locale: 'en' | 'fi'): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { locale } })
}

export async function getUserLocale(email: string): Promise<'en' | 'fi'> {
  const user = await prisma.user.findUnique({ where: { email }, select: { locale: true } })
  return (user?.locale as 'en' | 'fi') ?? 'en'
}
