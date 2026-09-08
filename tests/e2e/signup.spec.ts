import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})

test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('a fresh database lets the first visitor create the owner account and land on /events logged in', async ({ page }) => {
  await page.goto('/signup')
  await page.getByLabel('Name').fill('First Owner')
  await page.getByLabel('Email').fill('first-owner@example.com')
  await page.getByLabel('Password', { exact: true }).fill('a-secure-password-1')
  await page.getByRole('button', { name: /create owner account/i }).click()

  await expect(page).toHaveURL(/\/events/)
  await expect(page.getByText('first-owner@example.com')).toBeVisible()

  const user = await testPrisma.user.findUniqueOrThrow({ where: { email: 'first-owner@example.com' } })
  expect(user.isOwner).toBe(true)
})

test('signup is unreachable once a user already exists', async ({ page }) => {
  await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })

  await page.goto('/signup')

  await expect(page).toHaveURL(/\/login/)
})
