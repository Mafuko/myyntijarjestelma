import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

// Skipped: E2E login is currently broken by a placeholder Upstash rate-limit config unrelated to this
// test (tracked for a Session 11 fix) — this affects the ENTIRE E2E suite including auth.spec.ts's own
// revocation test, not just this one. The underlying deleteUserPii logic is proven by the integration
// tests above, and reuses the identical tokenVersion increment that lib/auth.ts's jwt callback checks on
// every session read (see lib/auth.ts) — the same mechanism, verified by source inspection, not by a
// currently-passing E2E test.
test.skip("owner deletes a user's PII, and that user can no longer log in", async ({ page }) => {
  await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const target = await testPrisma.user.create({
    data: { name: 'Target Seller', email: 'target@example.com', passwordHash: await hashPassword('target-pw-12345'), phone: '+358401234567' },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('owner@example.com')
  await page.getByLabel('Password').fill('owner-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto('/admin')
  await page.getByRole('row', { name: /Target Seller/ }).getByRole('button', { name: /delete pii/i }).click()
  await expect(page.getByText('Target Seller')).toHaveCount(0)

  const scrubbed = await testPrisma.user.findUniqueOrThrow({ where: { id: target.id } })
  expect(scrubbed.passwordHash).toBeNull()
  expect(scrubbed.phone).toBeNull()

  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email').fill('target@example.com')
  await page.getByLabel('Password').fill('target-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/login/)
})
