import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'staff-1' } }) }))
vi.mock('@/lib/services/sales', () => ({ lookupItemByCode: vi.fn(), recordSale: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('lookupCode action', () => {
  it('forwards the session and code to the service', async () => {
    const { lookupCode } = await import('@/actions/sales')
    const { lookupItemByCode } = await import('@/lib/services/sales')
    vi.mocked(lookupItemByCode).mockResolvedValueOnce({
      ok: true,
      data: { itemId: 'item-1', name: 'Manga', price: '5', sellerAlias: 'Kalle', status: 'LISTED' },
    })

    const result = await lookupCode('evt-1', 'CODE123')

    expect(result.ok).toBe(true)
    expect(lookupItemByCode).toHaveBeenCalledWith({ user: { id: 'staff-1' } }, 'evt-1', 'CODE123')
  })
})

describe('confirmSale action', () => {
  it('propagates an ALREADY_SOLD error unchanged', async () => {
    const { confirmSale } = await import('@/actions/sales')
    const { recordSale } = await import('@/lib/services/sales')
    vi.mocked(recordSale).mockResolvedValueOnce({
      ok: false,
      error: { code: 'ALREADY_SOLD', message: 'This item has already been sold' },
    })

    const result = await confirmSale('evt-1', 'item-1', 'BARCODE_SCAN')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ALREADY_SOLD')
  })

  it('returns UNEXPECTED_ERROR instead of throwing when recordSale rejects', async () => {
    const { confirmSale } = await import('@/actions/sales')
    const { recordSale } = await import('@/lib/services/sales')
    vi.mocked(recordSale).mockRejectedValueOnce(new Error('transaction timeout'))

    const result = await confirmSale('evt-1', 'item-1', 'BARCODE_SCAN')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNEXPECTED_ERROR')
      expect(result.error.message).toBe('Something went wrong recording the sale. Please try again.')
    }
  })
})
