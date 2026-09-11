import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { inviteUser, activateInvite, deleteUserPii, bootstrapOwner, updateUserLocale, getUserLocale } from '@/lib/services/users'

function sessionFor(userId: string) {
  return { user: { id: userId } }
}

async function createOwnerAndEvent() {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Test Event',
      eventDate: new Date('2026-09-01'),
      registrationDeadline: new Date('2026-08-25'),
      itemEditCutoffDate: new Date('2026-08-30'),
      createdByUserId: owner.id,
    },
  })
  return { owner, event }
}

describe('inviteUser', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('creates a pending user and pending membership for a new email, returning an invite URL', async () => {
    const { event } = await createOwnerAndEvent()

    const result = await inviteUser({
      name: 'New Seller',
      email: 'newseller@example.com',
      role: 'SELLER',
      eventId: event.id,
      sellerAlias: 'Kalle',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.inviteUrl).toMatch(/^\/invite\//)

    const membership = await testPrisma.eventMembership.findFirst({ where: { eventId: event.id } })
    expect(membership?.status).toBe('PENDING')
    expect(membership?.role).toBe('SELLER')
  })

  it('adds an already-active user to a new event as ACTIVE with no invite URL', async () => {
    const { event } = await createOwnerAndEvent()
    await testPrisma.user.create({
      data: { name: 'Existing Staff', email: 'staff@example.com', passwordHash: 'x' },
    })

    const result = await inviteUser({
      name: 'Existing Staff',
      email: 'staff@example.com',
      role: 'STAFF',
      eventId: event.id,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.inviteUrl).toBeNull()

    const membership = await testPrisma.eventMembership.findFirst({ where: { eventId: event.id } })
    expect(membership?.status).toBe('ACTIVE')
  })

  it('rejects inviting the same user to the same event twice', async () => {
    const { event } = await createOwnerAndEvent()
    await inviteUser({ name: 'Dup', email: 'dup@example.com', role: 'SELLER', eventId: event.id, sellerAlias: 'D' })

    const result = await inviteUser({
      name: 'Dup',
      email: 'dup@example.com',
      role: 'SELLER',
      eventId: event.id,
      sellerAlias: 'D',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALREADY_MEMBER')
  })

  it('rejects a SELLER invite without a sellerAlias', async () => {
    const { event } = await createOwnerAndEvent()
    const result = await inviteUser({ name: 'No Alias', email: 'noalias@example.com', role: 'SELLER', eventId: event.id })
    expect(result.ok).toBe(false)
  })
})

describe('activateInvite', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('sets a password hash and activates all pending memberships for that user', async () => {
    const { event } = await createOwnerAndEvent()
    const inviteResult = await inviteUser({
      name: 'Seller X',
      email: 'sellerx@example.com',
      role: 'SELLER',
      eventId: event.id,
      sellerAlias: 'X',
    })
    if (!inviteResult.ok) throw new Error('setup failed')
    const token = inviteResult.data.inviteUrl!.split('/').pop()!

    const result = await activateInvite({ token, password: 'a-secure-password-1' })

    expect(result.ok).toBe(true)
    const user = await testPrisma.user.findUnique({ where: { email: 'sellerx@example.com' } })
    expect(user?.passwordHash).toBeTruthy()
    expect(user?.passwordHash).not.toBe('a-secure-password-1')
    expect(user?.inviteToken).toBeNull()

    const membership = await testPrisma.eventMembership.findFirst({ where: { userId: user!.id } })
    expect(membership?.status).toBe('ACTIVE')
  })

  it('rejects an unknown token', async () => {
    const result = await activateInvite({ token: 'does-not-exist', password: 'a-secure-password-1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_TOKEN')
  })
})

describe('deleteUserPii', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('scrubs PII fields, prevents future login, and writes an audit log', async () => {
    const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner4@example.com', isOwner: true, passwordHash: 'x' } })
    const target = await testPrisma.user.create({
      data: { name: 'Real Name', email: 'real@example.com', phone: '+358401234567', passwordHash: 'hash', ibanCiphertext: 'ciphertext' },
    })

    const result = await deleteUserPii(sessionFor(owner.id), target.id)
    expect(result.ok).toBe(true)

    const scrubbed = await testPrisma.user.findUniqueOrThrow({ where: { id: target.id } })
    expect(scrubbed.name).toBe('Deleted user')
    expect(scrubbed.phone).toBeNull()
    expect(scrubbed.ibanCiphertext).toBeNull()
    expect(scrubbed.passwordHash).toBeNull()
    expect(scrubbed.email).not.toBe('real@example.com')

    const log = await testPrisma.auditLog.findFirst({ where: { action: 'USER_PII_DELETED' } })
    expect(log?.targetId).toBe(target.id)
  })

  it('rejects a non-owner', async () => {
    const admin = await testPrisma.user.create({ data: { name: 'Admin', email: 'admin4@example.com', passwordHash: 'x' } })
    const target = await testPrisma.user.create({ data: { name: 'Target', email: 'target2@example.com', passwordHash: 'x' } })
    const result = await deleteUserPii(sessionFor(admin.id), target.id)
    expect(result.ok).toBe(false)
  })
})

describe('bootstrapOwner', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('creates an owner user with a hashed password when the database has zero users', async () => {
    const result = await bootstrapOwner({ name: 'First Owner', email: 'first-owner@example.com', password: 'a-secure-password-1' })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: result.data.userId } })
    expect(user.isOwner).toBe(true)
    expect(user.email).toBe('first-owner@example.com')
    expect(user.passwordHash).toBeTruthy()
    expect(user.passwordHash).not.toBe('a-secure-password-1')
  })

  it('rejects when a user already exists', async () => {
    await testPrisma.user.create({ data: { name: 'Existing', email: 'existing@example.com', passwordHash: 'x' } })

    const result = await bootstrapOwner({ name: 'Second Owner', email: 'second-owner@example.com', password: 'a-secure-password-1' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALREADY_INITIALIZED')

    const count = await testPrisma.user.count()
    expect(count).toBe(1)
  })

  it('rejects a password shorter than 10 characters', async () => {
    const result = await bootstrapOwner({ name: 'First Owner', email: 'first-owner@example.com', password: 'short' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION_ERROR')

    const count = await testPrisma.user.count()
    expect(count).toBe(0)
  })

  it('lets only one of two concurrent bootstrap attempts succeed on an empty database', async () => {
    const [first, second] = await Promise.all([
      bootstrapOwner({ name: 'Racer A', email: 'racer-a@example.com', password: 'a-secure-password-1' }),
      bootstrapOwner({ name: 'Racer B', email: 'racer-b@example.com', password: 'a-secure-password-2' }),
    ])

    const outcomes = [first, second]
    const succeeded = outcomes.filter((r) => r.ok)
    const failed = outcomes.filter((r) => !r.ok)

    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)
    if (failed[0].ok) return
    expect(failed[0].error.code).toBe('ALREADY_INITIALIZED')

    const count = await testPrisma.user.count()
    expect(count).toBe(1)
  })
})

describe('updateUserLocale / getUserLocale', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('defaults a new user to en', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Fresh User', email: 'fresh@example.com', passwordHash: 'x' } })
    const locale = await getUserLocale(user.email)
    expect(locale).toBe('en')
  })

  it('persists an updated locale and reflects it via getUserLocale', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Fresh User', email: 'fresh2@example.com', passwordHash: 'x' } })
    await updateUserLocale(user.id, 'fi')
    const locale = await getUserLocale(user.email)
    expect(locale).toBe('fi')
  })

  it('returns en for an email with no matching user', async () => {
    const locale = await getUserLocale('does-not-exist@example.com')
    expect(locale).toBe('en')
  })
})
