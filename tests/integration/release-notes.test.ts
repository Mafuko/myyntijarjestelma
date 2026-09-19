import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { getEffectiveRole } from '@/lib/services/release-notes'

describe('getEffectiveRole', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('returns OWNER for a global owner regardless of memberships', async () => {
    const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
    expect(await getEffectiveRole(owner.id)).toBe('OWNER')
  })

  it('returns SELLER for a user with no memberships at all', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Nobody', email: 'nobody@example.com', passwordHash: 'x' } })
    expect(await getEffectiveRole(user.id)).toBe('SELLER')
  })

  it('returns the highest role across multiple ACTIVE memberships', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Multi', email: 'multi@example.com', passwordHash: 'x' } })
    const owner = await testPrisma.user.create({ data: { name: 'Owner2', email: 'owner2@example.com', isOwner: true, passwordHash: 'x' } })
    const event1 = await testPrisma.event.create({
      data: { name: 'E1', eventDate: new Date(Date.now() + 86400000), registrationDeadline: new Date(), itemEditCutoffDate: new Date(), createdByUserId: owner.id },
    })
    const event2 = await testPrisma.event.create({
      data: { name: 'E2', eventDate: new Date(Date.now() + 86400000), registrationDeadline: new Date(), itemEditCutoffDate: new Date(), createdByUserId: owner.id },
    })
    await testPrisma.eventMembership.create({ data: { userId: user.id, eventId: event1.id, role: 'SELLER', status: 'ACTIVE' } })
    await testPrisma.eventMembership.create({ data: { userId: user.id, eventId: event2.id, role: 'STAFF', status: 'ACTIVE' } })
    expect(await getEffectiveRole(user.id)).toBe('STAFF')
  })

  it('ignores REMOVED memberships when computing the highest role', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Removed', email: 'removed@example.com', passwordHash: 'x' } })
    const owner = await testPrisma.user.create({ data: { name: 'Owner3', email: 'owner3@example.com', isOwner: true, passwordHash: 'x' } })
    const event = await testPrisma.event.create({
      data: { name: 'E3', eventDate: new Date(Date.now() + 86400000), registrationDeadline: new Date(), itemEditCutoffDate: new Date(), createdByUserId: owner.id },
    })
    await testPrisma.eventMembership.create({ data: { userId: user.id, eventId: event.id, role: 'ADMIN', status: 'REMOVED' } })
    expect(await getEffectiveRole(user.id)).toBe('SELLER')
  })
})

describe('getLatestVisibleReleaseNote and markReleaseNoteSeen', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('returns the real seeded latest visible entry for a fresh (SELLER-effective) user, then null after marking it seen', async () => {
    const { getLatestVisibleReleaseNote, markReleaseNoteSeen } = await import('@/lib/services/release-notes')
    const user = await testPrisma.user.create({ data: { name: 'Fresh', email: 'fresh@example.com', passwordHash: 'x' } })

    // The newest entry in messages/release-notes.json is now the
    // 2026-09-19 general one (no minRole), so it's visible to a plain
    // SELLER too, superseding the older STAFF-only 2026-09-18 entry.
    const first = await getLatestVisibleReleaseNote(user.id)
    expect(first?.date).toBe('2026-09-19')

    await markReleaseNoteSeen(user.id, first!.date)
    const second = await getLatestVisibleReleaseNote(user.id)
    expect(second).toBeNull()
  })
})
