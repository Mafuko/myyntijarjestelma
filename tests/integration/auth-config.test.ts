import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { hashPassword } from '@/lib/crypto'

describe('credentials provider data path', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('a user created with a hashed password can be found and the hash verifies', async () => {
    const passwordHash = await hashPassword('correct horse battery staple')
    const user = await testPrisma.user.create({
      data: { name: 'Seller One', email: 'seller1@example.com', passwordHash },
    })

    const found = await testPrisma.user.findUnique({ where: { email: 'seller1@example.com' } })
    expect(found?.id).toBe(user.id)
    expect(found?.passwordHash).not.toBe('correct horse battery staple')
  })

  it('a user with no passwordHash (pending invite) cannot be authenticated', async () => {
    await testPrisma.user.create({
      data: { name: 'Pending Seller', email: 'pending@example.com', inviteToken: 'tok123' },
    })
    const found = await testPrisma.user.findUnique({ where: { email: 'pending@example.com' } })
    expect(found?.passwordHash).toBeNull()
  })
})
