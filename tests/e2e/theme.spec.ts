import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('toggling the flag switches the theme and it survives a reload', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: /switch to light mode/i }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: /switch to dark mode/i }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
})

test('a user whose stored theme is light lands in light mode on a fresh browser context', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner-theme@example.com', isOwner: true, passwordHash: await hashPassword('owner-theme-pw1') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const seller = await testPrisma.user.create({
    data: { name: 'Light Seller', email: 'light-seller@example.com', passwordHash: await hashPassword('light-seller-pw1'), theme: 'light' },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'S', status: 'ACTIVE' },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('light-seller@example.com')
  await page.getByLabel('Password', { exact: true }).fill('light-seller-pw1')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})
