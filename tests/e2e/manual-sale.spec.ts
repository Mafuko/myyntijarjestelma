import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('staff sells an item by browsing to its seller, then undoes the sale', async ({ page }) => {
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
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller-manual@example.com', passwordHash: 'x' } })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kirppis-Kalle', status: 'ACTIVE' },
  })
  await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Manga Vol. 1', price: 5, categoryId: category.id },
  })
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff-manual@example.com', passwordHash: await hashPassword('staff-pw-12345') },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('staff-manual@example.com')
  await page.getByLabel('Password', { exact: true }).fill('staff-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/checkout`)
  await page.getByRole('button', { name: /sell by seller/i }).click()
  await page.getByText('Kirppis-Kalle').click()
  await expect(page.getByText('Manga Vol. 1')).toBeVisible()

  await page.getByRole('button', { name: /^sell$/i }).click()
  await expect(page.getByRole('button', { name: /undo sale/i })).toBeVisible()

  const sold = await testPrisma.item.findFirstOrThrow({ where: { eventId: event.id, name: 'Manga Vol. 1' } })
  expect(sold.status).toBe('SOLD')
  const sale = await testPrisma.sale.findUnique({ where: { itemId: sold.id } })
  expect(sale?.method).toBe('MANUAL_OVERRIDE')

  await page.getByRole('button', { name: /undo sale/i }).click()
  await expect(page.getByRole('button', { name: /^sell$/i })).toBeVisible()

  const reverted = await testPrisma.item.findUniqueOrThrow({ where: { id: sold.id } })
  expect(reverted.status).toBe('LISTED')
  expect(await testPrisma.sale.findUnique({ where: { itemId: sold.id } })).toBeNull()
})
