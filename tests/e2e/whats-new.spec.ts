import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('a fresh user sees the latest visible release note and can dismiss it', async ({ page }) => {
  await testPrisma.user.create({
    data: { name: 'Seller', email: 'seller-whatsnew@example.com', passwordHash: await hashPassword('seller-whatsnew-pw1') },
  })

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('seller-whatsnew@example.com')
  await page.getByLabel('Password', { exact: true }).fill('seller-whatsnew-pw1')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)
  await page.waitForLoadState('networkidle')

  // The newest entry (STAFF-only) is filtered out for a plain SELLER, so
  // the older, general entry is their "latest visible" one.
  await expect(page.getByText('The app is now fully available in Finnish — look for the flag button next to your name.')).toBeVisible()
  await expect(page.getByText('Staff can now view and print price tags')).not.toBeVisible()

  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('The app is now fully available in Finnish')).not.toBeVisible()

  await page.reload()
  await expect(page.getByText('The app is now fully available in Finnish')).not.toBeVisible()
})

test('a STAFF member sees the STAFF-only note that a plain SELLER (Test 1, above) would not', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner-whatsnew@example.com', isOwner: true, passwordHash: await hashPassword('owner-whatsnew-pw1') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff-whatsnew@example.com', passwordHash: await hashPassword('staff-whatsnew-pw1') },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('staff-whatsnew@example.com')
  await page.getByLabel('Password', { exact: true }).fill('staff-whatsnew-pw1')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  // The STAFF-only entry (2026-09-18) is the newest entry in the file at
  // all, so it's this user's "latest visible" one straight away — no prior
  // dismissal needed to demonstrate the role gate.
  await expect(page.getByText('Staff can now view and print price tags')).toBeVisible()
})
