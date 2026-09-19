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

  // The newest entry overall is now general (no minRole), so it's this
  // SELLER's "latest visible" one too -- the older STAFF-only entry stays
  // hidden either way.
  await expect(page.getByText('Price tags now open a preview page first')).toBeVisible()
  await expect(page.getByText('Staff can now view and print price tags')).not.toBeVisible()

  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('Price tags now open a preview page first')).not.toBeVisible()

  // The banner hides itself via local state the instant it's clicked, before
  // the fire-and-forget dismissReleaseNote() write reaches the server --
  // wait for that in-flight request to actually land before reloading, or
  // reload can race it and the banner reappears.
  await page.waitForLoadState('networkidle')
  await page.reload()
  await expect(page.getByText('Price tags now open a preview page first')).not.toBeVisible()
})

test('a STAFF member (real membership) also sees the same newest general note', async ({ page }) => {
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

  // The newest entry (general, no minRole) is visible to every role,
  // computed here via a real ACTIVE STAFF membership -- exercising
  // getEffectiveRole's real database path, not just the no-membership
  // default-SELLER path the test above covers. Role-scoped filtering
  // itself (a STAFF-only entry being invisible to a SELLER) is already
  // covered exhaustively by tests/unit/release-notes.test.ts's fixture-based
  // unit tests, which don't depend on which entry currently happens to be
  // the real file's overall newest.
  await expect(page.getByText('Price tags now open a preview page first')).toBeVisible()
})
