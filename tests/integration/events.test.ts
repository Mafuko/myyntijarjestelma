import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { createEvent, updateEvent, listEventsForUser } from '@/lib/services/events'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function makeUsers() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const other = await testPrisma.user.create({ data: { name: 'Other', email: 'other@example.com', passwordHash: 'x' } })
  return { owner, other }
}

const EVENT_INPUT = {
  name: 'Kesäkirppis',
  eventDate: '2026-09-01',
  registrationDeadline: '2026-08-25',
  itemEditCutoffDate: '2026-08-30',
}

describe('createEvent', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('allows the owner to create an event with default categories seeded and an audit entry written', async () => {
    const { owner } = await makeUsers()
    const result = await createEvent(sessionFor(owner.id), EVENT_INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const categories = await testPrisma.category.findMany({ where: { eventId: result.data.eventId } })
    expect(categories.length).toBeGreaterThan(0)

    const log = await testPrisma.auditLog.findFirst({ where: { action: 'EVENT_CREATED' } })
    expect(log?.targetId).toBe(result.data.eventId)
  })

  it('rejects a non-owner', async () => {
    const { other } = await makeUsers()
    const result = await createEvent(sessionFor(other.id), EVENT_INPUT)
    expect(result.ok).toBe(false)
  })

  it('rejects an unauthenticated caller', async () => {
    const result = await createEvent(null, EVENT_INPUT)
    expect(result.ok).toBe(false)
  })
})

describe('updateEvent', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('logs a commission-rate-changed audit entry only when the rate actually changes', async () => {
    const { owner } = await makeUsers()
    const created = await createEvent(sessionFor(owner.id), EVENT_INPUT)
    if (!created.ok) throw new Error('setup failed')

    await updateEvent(sessionFor(owner.id), created.data.eventId, { name: 'Renamed' })
    let logs = await testPrisma.auditLog.findMany({ where: { action: 'EVENT_COMMISSION_RATE_CHANGED' } })
    expect(logs).toHaveLength(0)

    await updateEvent(sessionFor(owner.id), created.data.eventId, { commissionRate: 0.15 })
    logs = await testPrisma.auditLog.findMany({ where: { action: 'EVENT_COMMISSION_RATE_CHANGED' } })
    expect(logs).toHaveLength(1)
  })
})

describe('listEventsForUser', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it("shows the owner all events, and a member only their ACTIVE-membership events", async () => {
    const { owner, other } = await makeUsers()
    const created = await createEvent(sessionFor(owner.id), EVENT_INPUT)
    if (!created.ok) throw new Error('setup failed')

    await testPrisma.eventMembership.create({
      data: { userId: other.id, eventId: created.data.eventId, role: 'STAFF', status: 'PENDING' },
    })

    expect(await listEventsForUser(owner.id)).toHaveLength(1)
    expect(await listEventsForUser(other.id)).toHaveLength(0)

    await testPrisma.eventMembership.updateMany({ where: { userId: other.id }, data: { status: 'ACTIVE' } })
    const otherEvents = await listEventsForUser(other.id)
    expect(otherEvents).toHaveLength(1)
    expect(otherEvents[0].role).toBe('STAFF')
  })
})
