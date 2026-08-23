import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { writeAuditLog } from '@/lib/services/audit'

describe('writeAuditLog', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('creates an audit log row with the given fields', async () => {
    const actor = await testPrisma.user.create({ data: { name: 'Admin', email: 'admin2@example.com', passwordHash: 'x' } })
    await writeAuditLog({
      actorUserId: actor.id,
      action: 'EVENT_COMMISSION_RATE_CHANGED',
      targetType: 'Event',
      targetId: 'event-123',
      metadata: { from: '0.10', to: '0.12' },
    })

    const logs = await testPrisma.auditLog.findMany()
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('EVENT_COMMISSION_RATE_CHANGED')
    expect(logs[0].metadata).toEqual({ from: '0.10', to: '0.12' })
  })

  it('redacts sensitive keys in metadata instead of storing them', async () => {
    const actor = await testPrisma.user.create({ data: { name: 'Admin', email: 'admin3@example.com', passwordHash: 'x' } })
    await writeAuditLog({
      actorUserId: actor.id,
      action: 'USER_PASSWORD_RESET',
      targetType: 'User',
      targetId: 'user-456',
      metadata: { passwordHash: 'should-not-be-stored', iban: 'FI2112345600000785' },
    })

    const log = await testPrisma.auditLog.findFirstOrThrow()
    expect(log.metadata).toEqual({ passwordHash: '[redacted]', iban: '[redacted]' })
  })
})
