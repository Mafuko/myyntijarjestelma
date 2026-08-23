import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'

describe('database connectivity', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('starts with zero users after reset', async () => {
    const count = await testPrisma.user.count()
    expect(count).toBe(0)
  })

  it('can create and read back a user', async () => {
    const user = await testPrisma.user.create({
      data: { name: 'Test Owner', email: 'owner@example.com', isOwner: true },
    })
    const found = await testPrisma.user.findUnique({ where: { id: user.id } })
    expect(found?.email).toBe('owner@example.com')
  })
})
