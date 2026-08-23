import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'

test.beforeEach(async () => {
  await resetDb()
})

test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('invited user sets a password, logs in, and unauthenticated access is redirected', async ({ page }) => {
  const inviteToken = 'e2e-test-token-123'
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'irrelevant' },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Test Flea Market',
      eventDate: new Date('2026-09-01'),
      registrationDeadline: new Date('2026-08-25'),
      itemEditCutoffDate: new Date('2026-08-30'),
      createdByUserId: owner.id,
    },
  })
  const seller = await testPrisma.user.create({
    data: { name: 'Test Seller', email: 'seller@example.com', inviteToken },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kirppis-Kalle', status: 'PENDING' },
  })

  await page.goto(`/invite/${inviteToken}`)
  await page.getByLabel('Password').fill('a-very-secure-password')
  await page.getByRole('button', { name: /set password/i }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.getByLabel('Email').fill('seller@example.com')
  await page.getByLabel('Password').fill('a-very-secure-password')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)
  await expect(page.getByText('seller@example.com')).toBeVisible()

  await page.context().clearCookies()
  await page.goto('/events')
  await expect(page).toHaveURL(/\/login/)
})
