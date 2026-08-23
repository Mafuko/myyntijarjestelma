import { describe, it, expect } from 'vitest'
import { isValidIban } from '@/lib/validation/user'

describe('isValidIban', () => {
  it('accepts a valid Finnish IBAN', () => {
    expect(isValidIban('FI2112345600000785')).toBe(true)
  })

  it('accepts a valid IBAN written with spaces', () => {
    expect(isValidIban('FI21 1234 5600 0007 85')).toBe(true)
  })

  it('rejects an IBAN with a bad checksum', () => {
    expect(isValidIban('FI2112345600000786')).toBe(false)
  })

  it('rejects a malformed string', () => {
    expect(isValidIban('not-an-iban')).toBe(false)
  })
})
