import { describe, it, expect, vi } from 'vitest'
import { checkRateLimit } from '@/lib/rate-limit'

describe('checkRateLimit', () => {
  it('returns allowed: true when the underlying limiter reports success', async () => {
    const limiter = { limit: vi.fn().mockResolvedValue({ success: true }) } as any
    const result = await checkRateLimit(limiter, 'user-1')
    expect(result.allowed).toBe(true)
    expect(limiter.limit).toHaveBeenCalledWith('user-1')
  })

  it('returns allowed: false when the underlying limiter reports failure', async () => {
    const limiter = { limit: vi.fn().mockResolvedValue({ success: false }) } as any
    const result = await checkRateLimit(limiter, 'user-1')
    expect(result.allowed).toBe(false)
  })
})
