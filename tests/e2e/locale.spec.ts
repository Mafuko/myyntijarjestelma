import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('toggling the flag switches the login page language and it survives a reload', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()

  await page.getByRole('button', { name: /switch to finnish/i }).click()
  await expect(page.getByRole('heading', { name: 'Kirjaudu sisään' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Kirjaudu sisään' })).toBeVisible()

  await page.getByRole('button', { name: /vaihda englanniksi/i }).click()
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
})

test('a user whose stored locale is fi lands in Finnish on a fresh browser context, including the event nav', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const seller = await testPrisma.user.create({
    data: { name: 'Finnish Seller', email: 'fi-seller@example.com', passwordHash: await hashPassword('fi-seller-pw-123'), locale: 'fi' },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Suomalainen', status: 'ACTIVE' },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('fi-seller@example.com')
  await page.getByLabel('Password', { exact: true }).fill('fi-seller-pw-123')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}`)
  await expect(page.getByRole('link', { name: 'Omat tuotteet' })).toBeVisible()
})
