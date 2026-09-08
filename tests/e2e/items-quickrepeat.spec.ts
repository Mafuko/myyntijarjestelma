import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('quick-repeat: category and K-18 persist across submissions, name/price clear', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const catA = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const catB = await testPrisma.category.create({ data: { eventId: event.id, name: 'Kirjat' } })

  const sellerA = await testPrisma.user.create({
    data: { name: 'Seller A', email: 'sellera@example.com', passwordHash: await hashPassword('seller-a-pw-123') },
  })
  await testPrisma.eventMembership.create({
    data: { userId: sellerA.id, eventId: event.id, role: 'SELLER', sellerAlias: 'A', status: 'ACTIVE' },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('sellera@example.com')
  await page.getByLabel('Password', { exact: true }).fill('seller-a-pw-123')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/items`)

  // Scoped to the "Add an item" form specifically: the items page also has
  // a series/bundle form with its own categoryId select and isAgeRestricted
  // checkbox, so an unscoped page-wide locator would be ambiguous.
  const addItemForm = page.locator('form').filter({ has: page.getByPlaceholder('Item name') })

  // First submission: pick category B and check K-18.
  await addItemForm.getByPlaceholder('Item name').fill('Item One')
  await addItemForm.getByPlaceholder('Price', { exact: true }).fill('5')
  await addItemForm.locator('select[name="categoryId"]').selectOption(catB.id)
  await addItemForm.locator('input[name="isAgeRestricted"]').check()
  await page.getByRole('button', { name: /add item/i }).click()
  await expect(page.getByText('Item One')).toBeVisible()

  // After the first successful submit: name/price should be cleared,
  // category/K-18 should still reflect the previous choice (quick-repeat).
  await expect(addItemForm.getByPlaceholder('Item name')).toHaveValue('')
  await expect(addItemForm.getByPlaceholder('Price', { exact: true })).toHaveValue('')
  await expect(addItemForm.locator('select[name="categoryId"]')).toHaveValue(catB.id)
  await expect(addItemForm.locator('input[name="isAgeRestricted"]')).toBeChecked()

  // Second submission using the retained category/checkbox state.
  await addItemForm.getByPlaceholder('Item name').fill('Item Two')
  await addItemForm.getByPlaceholder('Price', { exact: true }).fill('7')
  await page.getByRole('button', { name: /add item/i }).click()
  await expect(page.getByText('Item Two')).toBeVisible()

  const items = await testPrisma.item.findMany({ where: { eventId: event.id }, orderBy: { createdAt: 'asc' } })
  expect(items.map((i) => ({ name: i.name, categoryId: i.categoryId, isAgeRestricted: i.isAgeRestricted }))).toEqual([
    { name: 'Item One', categoryId: catB.id, isAgeRestricted: true },
    { name: 'Item Two', categoryId: catB.id, isAgeRestricted: true },
  ])

  await expect(addItemForm.locator('select[name="categoryId"]')).toHaveValue(catB.id)
  await expect(addItemForm.locator('input[name="isAgeRestricted"]')).toBeChecked()
})
