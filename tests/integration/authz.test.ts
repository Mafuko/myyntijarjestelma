import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { requireEventAccess, requireOwner } from '@/lib/services/authz'

async function setupEventWithMembers() {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' },
  })
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })
  const staff = await testPrisma.user.create({ data: { name: 'Staff', email: 'staff@example.com', passwordHash: 'x' } })
  const admin = await testPrisma.user.create({ data: { name: 'Admin', email: 'admin@example.com', passwordHash: 'x' } })
  const outsider = await testPrisma.user.create({ data: { name: 'Outsider', email: 'outsider@example.com', passwordHash: 'x' } })

  const event = await testPrisma.event.create({
    data: {
      name: 'Event A',
      eventDate: new Date('2026-09-01'),
      registrationDeadline: new Date('2026-08-25'),
      itemEditCutoffDate: new Date('2026-08-30'),
      createdByUserId: owner.id,
    },
  })
  const otherEvent = await testPrisma.event.create({
    data: {
      name: 'Event B',
      eventDate: new Date('2026-10-01'),
      registrationDeadline: new Date('2026-09-25'),
      itemEditCutoffDate: new Date('2026-09-30'),
      createdByUserId: owner.id,
    },
  })

  await testPrisma.eventMembership.createMany({
    data: [
      { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'S', status: 'ACTIVE' },
      { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' },
      { userId: admin.id, eventId: event.id, role: 'ADMIN', status: 'ACTIVE' },
    ],
  })

  return { owner, seller, staff, admin, outsider, event, otherEvent }
}

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

describe('requireEventAccess authorization matrix', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('denies an unauthenticated caller', async () => {
    const { event } = await setupEventWithMembers()
    const result = await requireEventAccess(null, event.id, ['ADMIN'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED')
  })

  it('allows the owner regardless of membership', async () => {
    const { owner, event } = await setupEventWithMembers()
    const result = await requireEventAccess(sessionFor(owner.id), event.id, ['ADMIN'])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.role).toBe('OWNER')
  })

  it('allows a matching role', async () => {
    const { staff, event } = await setupEventWithMembers()
    const result = await requireEventAccess(sessionFor(staff.id), event.id, ['STAFF', 'ADMIN'])
    expect(result.ok).toBe(true)
  })

  it('denies a non-matching role', async () => {
    const { seller, event } = await setupEventWithMembers()
    const result = await requireEventAccess(sessionFor(seller.id), event.id, ['ADMIN'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN')
  })

  it('denies a user with no membership in the event', async () => {
    const { outsider, event } = await setupEventWithMembers()
    const result = await requireEventAccess(sessionFor(outsider.id), event.id, ['SELLER', 'STAFF', 'ADMIN'])
    expect(result.ok).toBe(false)
  })

  it('denies a membership scoped to a different event', async () => {
    const { seller, otherEvent } = await setupEventWithMembers()
    const result = await requireEventAccess(sessionFor(seller.id), otherEvent.id, ['SELLER'])
    expect(result.ok).toBe(false)
  })

  it('denies a REMOVED membership even with a matching role', async () => {
    const { event, staff } = await setupEventWithMembers()
    await testPrisma.eventMembership.update({
      where: { userId_eventId: { userId: staff.id, eventId: event.id } },
      data: { status: 'REMOVED' },
    })
    const result = await requireEventAccess(sessionFor(staff.id), event.id, ['STAFF'])
    expect(result.ok).toBe(false)
  })

  it('denies a PENDING membership even with a matching role', async () => {
    const { event, staff } = await setupEventWithMembers()
    await testPrisma.eventMembership.update({
      where: { userId_eventId: { userId: staff.id, eventId: event.id } },
      data: { status: 'PENDING' },
    })
    const result = await requireEventAccess(sessionFor(staff.id), event.id, ['STAFF'])
    expect(result.ok).toBe(false)
  })
})

describe('requireOwner', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('allows the owner', async () => {
    const { owner } = await setupEventWithMembers()
    const result = await requireOwner(sessionFor(owner.id))
    expect(result.ok).toBe(true)
  })

  it('denies a non-owner', async () => {
    const { admin } = await setupEventWithMembers()
    const result = await requireOwner(sessionFor(admin.id))
    expect(result.ok).toBe(false)
  })

  it('denies an unauthenticated caller', async () => {
    const result = await requireOwner(null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED')
  })
})
