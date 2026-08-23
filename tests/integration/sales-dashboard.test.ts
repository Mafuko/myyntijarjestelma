import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { getSalesSnapshot } from '@/lib/services/sales-dashboard'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function setup() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const sellerA = await testPrisma.user.create({ data: { name: 'Seller A', email: 'sellerA@example.com', passwordHash: 'x' } })
  const sellerB = await testPrisma.user.create({ data: { name: 'Seller B', email: 'sellerB@example.com', passwordHash: 'x' } })
  const staff = await testPrisma.user.create({ data: { name: 'Staff', email: 'staff@example.com', passwordHash: 'x' } })

  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id, commissionRate: 0.1,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })

  await testPrisma.eventMembership.createMany({
    data: [
      { userId: sellerA.id, eventId: event.id, role: 'SELLER', sellerAlias: 'A', status: 'ACTIVE' },
      { userId: sellerB.id, eventId: event.id, role: 'SELLER', sellerAlias: 'B', status: 'ACTIVE' },
      { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' },
    ],
  })

  const itemA1 = await testPrisma.item.create({ data: { eventId: event.id, sellerId: sellerA.id, name: 'A1', price: 10, categoryId: category.id, status: 'SOLD' } })
  await testPrisma.sale.create({ data: { itemId: itemA1.id, soldByUserId: staff.id, method: 'BARCODE_SCAN' } })
  await testPrisma.item.create({ data: { eventId: event.id, sellerId: sellerA.id, name: 'A2', price: 5, categoryId: category.id, status: 'LISTED' } })
  const itemB1 = await testPrisma.item.create({ data: { eventId: event.id, sellerId: sellerB.id, name: 'B1', price: 20, categoryId: category.id, status: 'SOLD' } })
  await testPrisma.sale.create({ data: { itemId: itemB1.id, soldByUserId: staff.id, method: 'BARCODE_SCAN' } })

  return { owner, sellerA, sellerB, staff, event }
}

describe('getSalesSnapshot', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it("scopes a seller's snapshot to only their own items and revenue", async () => {
    const { sellerA, event } = await setup()
    const result = await getSalesSnapshot(sessionFor(sellerA.id), event.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toHaveLength(2)
    expect(result.data.totalRevenue).toBe('10.00')
    expect(result.data.commissionOwed).toBe('1.00')
  })

  it('shows staff every item and combined revenue across sellers', async () => {
    const { staff, event } = await setup()
    const result = await getSalesSnapshot(sessionFor(staff.id), event.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toHaveLength(3)
    expect(result.data.totalRevenue).toBe('30.00')
  })

  it('rejects an outsider with no membership', async () => {
    const { event } = await setup()
    const outsider = await testPrisma.user.create({ data: { name: 'Outsider', email: 'outsider2@example.com', passwordHash: 'x' } })
    const result = await getSalesSnapshot(sessionFor(outsider.id), event.id)
    expect(result.ok).toBe(false)
  })
})
