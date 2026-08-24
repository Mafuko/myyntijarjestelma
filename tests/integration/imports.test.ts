import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { validateImportRows, commitImport } from '@/lib/services/imports'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function setup() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  await testPrisma.category.create({ data: { eventId: event.id, name: 'Kirjat ja lehdet' } })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'S', status: 'ACTIVE' },
  })
  return { owner, seller, event }
}

describe('validateImportRows', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('accepts a row with a known category and reports errors for bad prices or unknown categories', async () => {
    const { seller, event } = await setup()
    const result = await validateImportRows(sessionFor(seller.id), event.id, [
      { Tavara: 'Manga Vol. 1', Hinta: '5', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
      { Tavara: 'Bad Price', Hinta: '-1', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
      { Tavara: 'Unknown Category Item', Hinta: '2', Tyyppi: 'Nonexistent', 'K-18': '' },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.validRows).toHaveLength(1)
    expect(result.data.validRows[0]).toMatchObject({ name: 'Manga Vol. 1', price: 5, isAgeRestricted: false })
    expect(result.data.rowErrors).toHaveLength(2)
    expect(result.data.rowErrors.map((e) => e.row)).toEqual([3, 4])
  })

  it('parses the K-18 column as a boolean', async () => {
    const { seller, event } = await setup()
    const result = await validateImportRows(sessionFor(seller.id), event.id, [
      { Tavara: 'Adult Item', Hinta: '10', Tyyppi: 'Kirjat ja lehdet', 'K-18': 'x' },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.validRows[0].isAgeRestricted).toBe(true)
  })

  it('rejects a caller with no membership on this event', async () => {
    const { event } = await setup()
    const outsider = await testPrisma.user.create({ data: { name: 'Outsider', email: 'outsider@example.com', passwordHash: 'x' } })
    const result = await validateImportRows(sessionFor(outsider.id), event.id, [
      { Tavara: 'Manga Vol. 1', Hinta: '5', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
    ])
    expect(result.ok).toBe(false)
  })
})

describe('commitImport', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('creates one item per valid row for the calling seller', async () => {
    const { seller, event } = await setup()
    const validated = await validateImportRows(sessionFor(seller.id), event.id, [
      { Tavara: 'Manga Vol. 1', Hinta: '5', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
      { Tavara: 'Manga Vol. 2', Hinta: '5', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
    ])
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    const { validRows } = validated.data

    const result = await commitImport(sessionFor(seller.id), event.id, validRows)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.createdCount).toBe(2)

    const items = await testPrisma.item.findMany({ where: { eventId: event.id, sellerId: seller.id } })
    expect(items).toHaveLength(2)
  })

  it('rejects committing after the cutoff date', async () => {
    const { seller, owner } = await setup()
    const closedEvent = await testPrisma.event.create({
      data: {
        name: 'Closed', eventDate: new Date(Date.now() - 86400000), registrationDeadline: new Date(Date.now() - 2 * 86400000),
        itemEditCutoffDate: new Date(Date.now() - 86400000), createdByUserId: owner.id,
      },
    })
    await testPrisma.category.create({ data: { eventId: closedEvent.id, name: 'Muu' } })
    await testPrisma.eventMembership.create({
      data: { userId: seller.id, eventId: closedEvent.id, role: 'SELLER', sellerAlias: 'S', status: 'ACTIVE' },
    })
    const validated = await validateImportRows(sessionFor(seller.id), closedEvent.id, [
      { Tavara: 'Late item', Hinta: '5', Tyyppi: 'Muu', 'K-18': '' },
    ])
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    const { validRows } = validated.data

    const result = await commitImport(sessionFor(seller.id), closedEvent.id, validRows)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CUTOFF_PASSED')
  })

  it('rejects a non-seller (e.g. staff) committing an import', async () => {
    const { seller, event } = await setup()
    const staff = await testPrisma.user.create({ data: { name: 'Staff', email: 'staff2@example.com', passwordHash: 'x' } })
    await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })
    const validated = await validateImportRows(sessionFor(seller.id), event.id, [
      { Tavara: 'Item', Hinta: '5', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
    ])
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    const { validRows } = validated.data

    const result = await commitImport(sessionFor(staff.id), event.id, validRows)
    expect(result.ok).toBe(false)
  })

  it('rejects a non-seller (e.g. staff) previewing an import via validateImportRows', async () => {
    const { event } = await setup()
    const staff = await testPrisma.user.create({ data: { name: 'Staff', email: 'staff3@example.com', passwordHash: 'x' } })
    await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })
    const result = await validateImportRows(sessionFor(staff.id), event.id, [
      { Tavara: 'Item', Hinta: '5', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
    ])
    expect(result.ok).toBe(false)
  })
})
