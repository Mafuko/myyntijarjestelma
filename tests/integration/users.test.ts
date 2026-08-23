import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { inviteUser, activateInvite } from '@/lib/services/users'

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
