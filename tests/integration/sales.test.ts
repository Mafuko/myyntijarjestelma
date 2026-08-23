import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'

vi.mock('@/lib/rate-limit', () => ({
  barcodeLookupRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

import { testPrisma, resetDb } from './setup'
import { lookupItemByCode, recordSale } from '@/lib/services/sales'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function setup() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const staff = await testPrisma.user.create({ data: { name: 'Staff', email: 'staff@example.com', passwordHash: 'x' } })
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  await testPrisma.eventMembership.createMany({
    data: [
      { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' },
      { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
    ],
  })
  const item = await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Manga Vol. 1', price: 5, categoryId: category.id, barcodeValue: 'CODE123456' },
  })
  return { owner, staff, seller, event, item }
}

describe('lookupItemByCode', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('finds a listed item by its barcode and returns the seller alias', async () => {
    const { staff, event, item } = await setup()
    const result = await lookupItemByCode(sessionFor(staff.id), event.id, item.barcodeValue!)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.name).toBe('Manga Vol. 1')
      expect(result.data.sellerAlias).toBe('Kalle')
      expect(result.data.status).toBe('LISTED')
    }
  })

  it('returns NOT_FOUND for an unknown code', async () => {
    const { staff, event } = await setup()
    const result = await lookupItemByCode(sessionFor(staff.id), event.id, 'DOES-NOT-EXIST')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('rejects a seller trying to use the lookup (staff/admin only)', async () => {
    const { seller, event, item } = await setup()
    const result = await lookupItemByCode(sessionFor(seller.id), event.id, item.barcodeValue!)
    expect(result.ok).toBe(false)
  })
})

describe('recordSale', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('marks the item SOLD and creates a Sale record', async () => {
    const { staff, item } = await setup()
    const result = await recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN')
    expect(result.ok).toBe(true)

    const updated = await testPrisma.item.findUniqueOrThrow({ where: { id: item.id } })
    expect(updated.status).toBe('SOLD')

    const sale = await testPrisma.sale.findUnique({ where: { itemId: item.id } })
    expect(sale?.soldByUserId).toBe(staff.id)
    expect(sale?.method).toBe('BARCODE_SCAN')
  })

  it('rejects recording a sale for an already-sold item', async () => {
    const { staff, item } = await setup()
    await recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN')
    const second = await recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN')
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.code).toBe('ALREADY_SOLD')
  })

  it('never double-sells the same item under concurrent recordSale calls', async () => {
    const { staff, item } = await setup()
    const [first, second] = await Promise.all([
      recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN'),
      recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN'),
    ])

    const results = [first, second]
    const successes = results.filter((r) => r.ok)
    const failures = results.filter((r) => !r.ok)
    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)
    if (!failures[0].ok) expect(failures[0].error.code).toBe('ALREADY_SOLD')

    const sales = await testPrisma.sale.findMany({ where: { itemId: item.id } })
    expect(sales).toHaveLength(1)
  })

  it('rejects a seller trying to record a sale (staff/admin only)', async () => {
    const { seller, item } = await setup()
    const result = await recordSale(sessionFor(seller.id), item.id, 'MANUAL_OVERRIDE')
    expect(result.ok).toBe(false)
  })
})
