import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { updatePayoutInfo, getOwnPayoutInfo } from '@/lib/services/profile'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
})

describe('updatePayoutInfo / getOwnPayoutInfo', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('stores the IBAN encrypted at rest and returns it decrypted to its owner', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })

    const result = await updatePayoutInfo(sessionFor(user.id), { payoutMethod: 'BANK_TRANSFER', iban: 'FI2112345600000785' })
    expect(result.ok).toBe(true)

    const raw = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(raw.ibanCiphertext).not.toBeNull()
    expect(raw.ibanCiphertext).not.toContain('FI21')

    const own = await getOwnPayoutInfo(sessionFor(user.id))
    expect(own.ok).toBe(true)
    if (own.ok) expect(own.data.iban).toBe('FI2112345600000785')
  })

  it('rejects an invalid IBAN', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller2@example.com', passwordHash: 'x' } })
    const result = await updatePayoutInfo(sessionFor(user.id), { payoutMethod: 'BANK_TRANSFER', iban: 'not-an-iban' })
    expect(result.ok).toBe(false)
  })

  it('allows CASH payout with no IBAN', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller3@example.com', passwordHash: 'x' } })
    const result = await updatePayoutInfo(sessionFor(user.id), { payoutMethod: 'CASH' })
    expect(result.ok).toBe(true)
  })
})
