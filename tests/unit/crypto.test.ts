import { describe, it, expect, beforeAll } from 'vitest'
import { hashPassword, verifyPassword, encryptIban, decryptIban } from '@/lib/crypto'

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('password hashing', () => {
  it('produces an argon2id hash distinct from the raw password', async () => {
    const h = await hashPassword('correct horse battery staple')
    expect(h).not.toBe('correct horse battery staple')
    expect(h).toMatch(/^\$argon2id\$/)
  })

  it('verifies a correct password and rejects an incorrect one', async () => {
    const h = await hashPassword('correct horse battery staple')
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true)
    expect(await verifyPassword(h, 'wrong password')).toBe(false)
  })
})

describe('IBAN encryption', () => {
  it('round-trips a value through encrypt/decrypt', () => {
    const ciphertext = encryptIban('FI2112345600000785')
    expect(ciphertext).not.toContain('FI21')
    expect(decryptIban(ciphertext)).toBe('FI2112345600000785')
  })

  it('produces different ciphertext for the same input on each call', () => {
    const a = encryptIban('FI2112345600000785')
    const b = encryptIban('FI2112345600000785')
    expect(a).not.toBe(b)
  })
})
