import { describe, it, expect } from 'vitest'
import { renderPriceTagsPdf } from '@/lib/services/price-tags'

describe('renderPriceTagsPdf', () => {
  it('renders a non-empty PDF buffer starting with the PDF magic bytes', async () => {
    const buffer = await renderPriceTagsPdf([
      { id: '1', name: 'Manga Vol. 1', price: '5.00', sellerAlias: 'Kalle', isAgeRestricted: false, barcodeValue: 'ABC123456789' },
    ])

    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('renders a K-18 item without throwing', async () => {
    const buffer = await renderPriceTagsPdf([
      { id: '2', name: 'Horror DVD', price: '8.00', sellerAlias: 'Liisa', isAgeRestricted: true, barcodeValue: 'DEF987654321' },
    ])
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF')
  })
})
