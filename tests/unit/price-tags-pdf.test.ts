import { describe, it, expect } from 'vitest'
import { renderPriceTagsPdf } from '@/lib/services/price-tags'

describe('renderPriceTagsPdf', () => {
  it('renders a non-empty PDF buffer starting with the PDF magic bytes', async () => {
    const buffer = await renderPriceTagsPdf(
      [{ id: '1', name: 'Manga Vol. 1', price: '5.00', sellerAlias: 'Kalle', isAgeRestricted: false, barcodeValue: 'ABC123456789' }],
      'Unknown'
    )

    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('renders a K-18 item without throwing', async () => {
    const buffer = await renderPriceTagsPdf(
      [{ id: '2', name: 'Horror DVD', price: '8.00', sellerAlias: 'Liisa', isAgeRestricted: true, barcodeValue: 'DEF987654321' }],
      'Unknown'
    )
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF')
  })

  it('substitutes the given fallback label for a null sellerAlias instead of throwing or rendering blank', async () => {
    const buffer = await renderPriceTagsPdf(
      [{ id: '3', name: 'Mystery Item', price: '2.00', sellerAlias: null, isAgeRestricted: false, barcodeValue: 'GHI135792468' }],
      'Tuntematon'
    )
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF')
    expect(buffer.length).toBeGreaterThan(1000)
  })
})
