import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('clicking Price tag opens a preview page with an embedded PDF and a working download link', async ({ page }) => {
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
  const seller = await testPrisma.user.create({
    data: { name: 'Seller', email: 'seller@example.com', passwordHash: await hashPassword('seller-pw-12345') },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
  })
  const item = await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Manga Vol. 1', price: 5, categoryId: category.id },
  })

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('seller@example.com')
  await page.getByLabel('Password', { exact: true }).fill('seller-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/items`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Price tag', exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`/events/${event.id}/items/price-tags\\?itemIds=${item.id}`))
  await expect(page.getByText('Price tag preview')).toBeVisible()
  await expect(page.getByText('1 item(s)')).toBeVisible()

  const iframe = page.locator('iframe')
  await expect(iframe).toHaveAttribute('src', `/api/price-tags/${event.id}?itemIds=${item.id}`)

  const downloadLink = page.getByRole('link', { name: 'Download' })
  await expect(downloadLink).toHaveAttribute('href', `/api/price-tags/${event.id}?itemIds=${item.id}&download=1`)

  const response = await page.request.get(`/api/price-tags/${event.id}?itemIds=${item.id}&download=1`)
  expect(response.headers()['content-disposition']).toBe('attachment; filename="price-tags.pdf"')
})

test('a seller with no access to an item is redirected away from its preview page', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner2@example.com', isOwner: true, passwordHash: await hashPassword('owner2-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const sellerA = await testPrisma.user.create({
    data: { name: 'Seller A', email: 'sellera@example.com', passwordHash: await hashPassword('sellerA-pw-12345') },
  })
  const sellerB = await testPrisma.user.create({
    data: { name: 'Seller B', email: 'sellerb@example.com', passwordHash: await hashPassword('sellerB-pw-12345') },
  })
  await testPrisma.eventMembership.create({ data: { userId: sellerA.id, eventId: event.id, role: 'SELLER', status: 'ACTIVE' } })
  await testPrisma.eventMembership.create({ data: { userId: sellerB.id, eventId: event.id, role: 'SELLER', status: 'ACTIVE' } })
  const itemB = await testPrisma.item.create({
    data: { eventId: event.id, sellerId: sellerB.id, name: 'Item B', price: 3, categoryId: category.id },
  })

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('sellera@example.com')
  await page.getByLabel('Password', { exact: true }).fill('sellerA-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/items/price-tags?itemIds=${itemB.id}`)
  await expect(page).toHaveURL(`/events/${event.id}/items`)
})
