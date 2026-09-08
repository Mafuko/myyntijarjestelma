import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('a seller can add an item and delete it, but never sees another seller\'s items', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })

  const sellerA = await testPrisma.user.create({
    data: { name: 'Seller A', email: 'sellera@example.com', passwordHash: await hashPassword('seller-a-pw-123') },
  })
  const sellerB = await testPrisma.user.create({
    data: { name: 'Seller B', email: 'sellerB@example.com', passwordHash: await hashPassword('seller-b-pw-123') },
  })
  await testPrisma.eventMembership.createMany({
    data: [
      { userId: sellerA.id, eventId: event.id, role: 'SELLER', sellerAlias: 'A', status: 'ACTIVE' },
      { userId: sellerB.id, eventId: event.id, role: 'SELLER', sellerAlias: 'B', status: 'ACTIVE' },
    ],
  })
  await testPrisma.item.create({
    data: { eventId: event.id, sellerId: sellerB.id, name: "Seller B's item", price: 3, categoryId: category.id },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('sellera@example.com')
  await page.getByLabel('Password', { exact: true }).fill('seller-a-pw-123')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/items`)
  await expect(page.getByText("Seller B's item")).toHaveCount(0)

  // Scoped to the "Add an item" form specifically: the items page also has
  // a series/bundle form whose "Price per item" placeholder is a substring
  // match for "Price", so an unscoped locator would be ambiguous.
  const addItemForm = page.locator('form').filter({ has: page.getByPlaceholder('Item name') })
  await addItemForm.getByPlaceholder('Item name').fill('Manga Vol. 1')
  await addItemForm.getByPlaceholder('Price', { exact: true }).fill('5')
  await page.getByRole('button', { name: /add item/i }).click()
  await expect(page.getByText('Manga Vol. 1')).toBeVisible()

  await page.getByRole('button', { name: /delete/i }).click()
  await expect(page.getByText('Manga Vol. 1')).toHaveCount(0)
})
