import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

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

test('bumping tokenVersion revokes an already-issued session', async ({ page }) => {
  // Simulates an admin revoking a user's access (e.g. deactivating them)
  // after they've already logged in and are holding a valid session
  // cookie. The spec requires sessions to be revocable server-side; under
  // the JWT strategy (required by the Credentials provider — see
  // lib/auth.ts) that guarantee is restored via a tokenVersion stamped on
  // the token at sign-in and re-checked against the database on every
  // session check.
  const passwordHash = await hashPassword('a-very-secure-password')
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner2@example.com', isOwner: true, passwordHash: 'irrelevant' },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Test Flea Market 2',
      eventDate: new Date('2026-09-01'),
      registrationDeadline: new Date('2026-08-25'),
      itemEditCutoffDate: new Date('2026-08-30'),
      createdByUserId: owner.id,
    },
  })
  const seller = await testPrisma.user.create({
    data: { name: 'Revoke Seller', email: 'revoke-seller@example.com', passwordHash },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Peruttu-Pekka', status: 'ACTIVE' },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('revoke-seller@example.com')
  await page.getByLabel('Password').fill('a-very-secure-password')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)
  await expect(page.getByText('revoke-seller@example.com')).toBeVisible()

  // Bump tokenVersion directly in the database, out from under the
  // already-issued session cookie — nothing re-authenticates, the cookie
  // is untouched. This proves it's the token-vs-database comparison doing
  // the invalidating, not merely that a fresh login picks up a new value.
  await testPrisma.user.update({
    where: { id: seller.id },
    data: { tokenVersion: { increment: 1 } },
  })

  await page.reload()
  await expect(page).toHaveURL(/\/login/)
})
