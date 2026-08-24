import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('staff scans a barcode, confirms with Enter, and the item becomes sold', async ({ page }) => {
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
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
  })
  const item = await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Manga Vol. 1', price: 5, categoryId: category.id, barcodeValue: 'CODE123456' },
  })
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff@example.com', passwordHash: await hashPassword('staff-pw-12345') },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('staff@example.com')
  await page.getByLabel('Password').fill('staff-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/checkout`)
  const input = page.getByPlaceholder('Scan or type code, then Enter')
  await input.fill('CODE123456')
  await input.press('Enter')

  await expect(page.getByText(/Selling.*Manga Vol\. 1/)).toBeVisible()
  await input.press('Enter')
  await expect(page.getByText('Sold: Manga Vol. 1')).toBeVisible()

  const updated = await testPrisma.item.findUniqueOrThrow({ where: { id: item.id } })
  expect(updated.status).toBe('SOLD')
})

test('scanning an already-sold item shows a distinct error message', async ({ page }) => {
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
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
  })
  await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Already Sold', price: 5, categoryId: category.id, barcodeValue: 'SOLDCODE1', status: 'SOLD' },
  })
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff2@example.com', passwordHash: await hashPassword('staff-pw-12345') },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('staff2@example.com')
  await page.getByLabel('Password').fill('staff-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/checkout`)
  const input = page.getByPlaceholder('Scan or type code, then Enter')
  await input.fill('SOLDCODE1')
  await input.press('Enter')

  await expect(page.getByText('Already sold: Already Sold')).toBeVisible()
})
