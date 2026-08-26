import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

async function loginAsSeller(page: import('@playwright/test').Page) {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Kirjat' } })
  const seller = await testPrisma.user.create({
    data: { name: 'Seller', email: 'seller@example.com', passwordHash: await hashPassword('seller-pw-12345') },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'S', status: 'ACTIVE' },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('seller@example.com')
  await page.getByLabel('Password').fill('seller-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)
  await page.goto(`/events/${event.id}/items`)

  return { event }
}

test('series mode creates one item per volume', async ({ page }) => {
  const { event } = await loginAsSeller(page)

  await page.getByPlaceholder('Base name (e.g. Naruto)').fill('Naruto')
  await page.getByPlaceholder('Start vol.').fill('1')
  await page.getByPlaceholder('End vol.').fill('4')
  await page.getByPlaceholder('Price per item').fill('5')
  await page.getByRole('button', { name: /create series/i }).click()

  await expect(page.getByText('Naruto Vol. 1')).toBeVisible()
  await expect(page.getByText('Naruto Vol. 2')).toBeVisible()
  await expect(page.getByText('Naruto Vol. 3')).toBeVisible()
  await expect(page.getByText('Naruto Vol. 4')).toBeVisible()

  const items = await testPrisma.item.findMany({ where: { eventId: event.id } })
  expect(items).toHaveLength(4)
})

test('bundle mode creates exactly one item for the whole range', async ({ page }) => {
  const { event } = await loginAsSeller(page)

  await page.getByLabel('Bundle (one item for the range)').check()
  await page.getByPlaceholder('Base name (e.g. Naruto)').fill('Naruto')
  await page.getByPlaceholder('Start vol.').fill('1')
  await page.getByPlaceholder('End vol.').fill('4')
  await page.getByPlaceholder('Price per item').fill('15')
  await page.getByRole('button', { name: /create bundle/i }).click()

  await expect(page.getByText('Naruto Vol. 1–4')).toBeVisible()
  await expect(page.getByText('Naruto Vol. 1', { exact: true })).toHaveCount(0)

  const items = await testPrisma.item.findMany({ where: { eventId: event.id } })
  expect(items).toHaveLength(1)
  expect(items[0].price.toString()).toBe('15')
})
