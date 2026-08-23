import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import {
  createItem,
  updateItem,
  deleteItem,
  listItemsForSeller,
  listAllItemsForEvent,
} from '@/lib/services/items'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function setup() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const sellerA = await testPrisma.user.create({ data: { name: 'Seller A', email: 'sellerA@example.com', passwordHash: 'x' } })
  const sellerB = await testPrisma.user.create({ data: { name: 'Seller B', email: 'sellerB@example.com', passwordHash: 'x' } })
  const staff = await testPrisma.user.create({ data: { name: 'Staff', email: 'staff@example.com', passwordHash: 'x' } })

  const futureCutoff = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const pastCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: futureCutoff, registrationDeadline: futureCutoff,
      itemEditCutoffDate: futureCutoff, createdByUserId: owner.id,
    },
  })
  const closedEvent = await testPrisma.event.create({
    data: {
      name: 'Closed Event', eventDate: pastCutoff, registrationDeadline: pastCutoff,
      itemEditCutoffDate: pastCutoff, createdByUserId: owner.id,
    },
  })

  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const closedCategory = await testPrisma.category.create({ data: { eventId: closedEvent.id, name: 'Vaatteet' } })

  await testPrisma.eventMembership.createMany({
    data: [
      { userId: sellerA.id, eventId: event.id, role: 'SELLER', sellerAlias: 'A', status: 'ACTIVE' },
      { userId: sellerB.id, eventId: event.id, role: 'SELLER', sellerAlias: 'B', status: 'ACTIVE' },
      { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' },
      { userId: sellerA.id, eventId: closedEvent.id, role: 'SELLER', sellerAlias: 'A', status: 'ACTIVE' },
    ],
  })

  return { owner, sellerA, sellerB, staff, event, closedEvent, category, closedCategory }
}

const ITEM_INPUT = (categoryId: string) => ({
  name: 'Manga Vol. 1',
  price: 5,
  categoryId,
  isAgeRestricted: false,
})

describe('createItem', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('lets a seller create an item for themselves in an open event', async () => {
    const { sellerA, event, category } = await setup()
    const result = await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const item = await testPrisma.item.findUniqueOrThrow({ where: { id: result.data.itemId } })
    expect(item.sellerId).toBe(sellerA.id)
    expect(item.status).toBe('LISTED')
  })

  it('rejects item creation by staff (staff cannot list items)', async () => {
    const { staff, event, category } = await setup()
    const result = await createItem(sessionFor(staff.id), event.id, ITEM_INPUT(category.id))
    expect(result.ok).toBe(false)
  })

  it('rejects item creation after the edit cutoff date has passed', async () => {
    const { sellerA, closedEvent, closedCategory } = await setup()
    const result = await createItem(sessionFor(sellerA.id), closedEvent.id, ITEM_INPUT(closedCategory.id))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('CUTOFF_PASSED')
  })
})

describe('updateItem / deleteItem', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it("rejects a seller editing another seller's item", async () => {
    const { sellerA, sellerB, event, category } = await setup()
    const created = await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    if (!created.ok) throw new Error('setup failed')

    const result = await updateItem(sessionFor(sellerB.id), created.data.itemId, { price: 10 })
    expect(result.ok).toBe(false)
  })

  it('allows an admin to delete any item and writes an audit log', async () => {
    const { owner, sellerA, event, category } = await setup()
    const created = await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    if (!created.ok) throw new Error('setup failed')

    const result = await deleteItem(sessionFor(owner.id), created.data.itemId)
    expect(result.ok).toBe(true)

    const item = await testPrisma.item.findUniqueOrThrow({ where: { id: created.data.itemId } })
    expect(item.status).toBe('REMOVED')

    const log = await testPrisma.auditLog.findFirst({ where: { action: 'ITEM_DELETED_BY_ADMIN' } })
    expect(log?.targetId).toBe(created.data.itemId)
  })

  it('does not audit-log a seller deleting their own item', async () => {
    const { sellerA, event, category } = await setup()
    const created = await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    if (!created.ok) throw new Error('setup failed')

    await deleteItem(sessionFor(sellerA.id), created.data.itemId)
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'ITEM_DELETED_BY_ADMIN' } })
    expect(log).toBeNull()
  })
})

describe('listItemsForSeller / listAllItemsForEvent', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it("scopes listItemsForSeller to only the caller's own items", async () => {
    const { sellerA, sellerB, event, category } = await setup()
    await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    await createItem(sessionFor(sellerB.id), event.id, ITEM_INPUT(category.id))

    const result = await listItemsForSeller(sessionFor(sellerA.id), event.id)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toHaveLength(1)
  })

  it('lets staff see every item in the event via listAllItemsForEvent', async () => {
    const { sellerA, sellerB, staff, event, category } = await setup()
    await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    await createItem(sessionFor(sellerB.id), event.id, ITEM_INPUT(category.id))

    const result = await listAllItemsForEvent(sessionFor(staff.id), event.id)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toHaveLength(2)
  })

  it('rejects a seller calling listAllItemsForEvent (staff/admin only)', async () => {
    const { sellerA, event } = await setup()
    const result = await listAllItemsForEvent(sessionFor(sellerA.id), event.id)
    expect(result.ok).toBe(false)
  })
})
