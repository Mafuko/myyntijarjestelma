import { describe, it, expect } from 'vitest'
import en from '@/messages/en.json'
import fi from '@/messages/fi.json'

describe('ServiceErrors message parity', () => {
  it('has the exact same set of keys in both locales', () => {
    const enKeys = Object.keys(en.ServiceErrors).sort()
    const fiKeys = Object.keys(fi.ServiceErrors).sort()
    expect(fiKeys).toEqual(enKeys)
  })

  it('has no empty translated values in either locale', () => {
    for (const [key, value] of Object.entries(en.ServiceErrors)) {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
    for (const [key, value] of Object.entries(fi.ServiceErrors)) {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
  })
})
