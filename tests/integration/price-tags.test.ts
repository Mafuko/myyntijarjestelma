import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { generatePriceTagData } from '@/lib/services/price-tags'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function setup() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const sellerA = await testPrisma.user.create({ data: { name: 'Seller A', email: 'sellerA@example.com', passwordHash: 'x' } })
  const sellerB = await testPrisma.user.create({ data: { name: 'Seller B', email: 'sellerB@example.com', passwordHash: 'x' } })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  await testPrisma.eventMembership.createMany({
    data: [
      { userId: sellerA.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
      { userId: sellerB.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Liisa', status: 'ACTIVE' },
    ],
  })
  const itemA = await testPrisma.item.create({ data: { eventId: event.id, sellerId: sellerA.id, name: 'Item A', price: 5, categoryId: category.id } })
  const itemB = await testPrisma.item.create({ data: { eventId: event.id, sellerId: sellerB.id, name: 'Item B', price: 3, categoryId: category.id } })
  return { owner, sellerA, sellerB, event, itemA, itemB }
}

describe('generatePriceTagData', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('assigns a stable, unique barcode to each item and includes the seller alias', async () => {
    const { sellerA, event, itemA } = await setup()
    const first = await generatePriceTagData(sessionFor(sellerA.id), event.id, [itemA.id])
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.data[0].sellerAlias).toBe('Kalle')
    const barcode1 = first.data[0].barcodeValue

    const second = await generatePriceTagData(sessionFor(sellerA.id), event.id, [itemA.id])
    if (!second.ok) throw new Error('unexpected failure')
    expect(second.data[0].barcodeValue).toBe(barcode1)
  })

  it('assigns different barcodes to different items', async () => {
    const { owner, event, itemA, itemB } = await setup()
    const result = await generatePriceTagData(sessionFor(owner.id), event.id, [itemA.id, itemB.id])
    if (!result.ok) throw new Error('unexpected failure')
    expect(result.data[0].barcodeValue).not.toBe(result.data[1].barcodeValue)
  })

  it("rejects a seller requesting tags for another seller's item", async () => {
    const { sellerA, event, itemB } = await setup()
    const result = await generatePriceTagData(sessionFor(sellerA.id), event.id, [itemB.id])
    expect(result.ok).toBe(false)
  })

  it('allows an admin/owner to generate tags for any item', async () => {
    const { owner, event, itemA, itemB } = await setup()
    const result = await generatePriceTagData(sessionFor(owner.id), event.id, [itemA.id, itemB.id])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toHaveLength(2)
  })
})
