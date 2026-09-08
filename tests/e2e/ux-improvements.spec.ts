import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})

test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('the password field has a show/hide toggle on the login page', async ({ page }) => {
  const passwordHash = await hashPassword('a-secure-password-1')
  await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash },
  })

  await page.goto('/login')
  const passwordField = page.getByLabel('Password', { exact: true })
  await passwordField.fill('a-secure-password-1')
  await expect(passwordField).toHaveAttribute('type', 'password')

  await page.getByRole('button', { name: /show password/i }).click()
  await expect(passwordField).toHaveAttribute('type', 'text')
  await expect(passwordField).toHaveValue('a-secure-password-1')

  await page.getByRole('button', { name: /hide password/i }).click()
  await expect(passwordField).toHaveAttribute('type', 'password')
})

test('the back button returns to the previous dashboard page', async ({ page }) => {
  const passwordHash = await hashPassword('staff-pw-12345')
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner-back@example.com', isOwner: true, passwordHash: 'irrelevant' },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Back Nav Kirppis',
      eventDate: new Date('2026-09-01'),
      registrationDeadline: new Date('2026-08-25'),
      itemEditCutoffDate: new Date('2026-08-30'),
      createdByUserId: owner.id,
    },
  })
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff-back@example.com', passwordHash },
  })
  await testPrisma.eventMembership.create({
    data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('staff-back@example.com')
  await page.getByLabel('Password', { exact: true }).fill('staff-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events$/)

  await page.getByRole('link', { name: 'Back Nav Kirppis' }).click()
  await expect(page).toHaveURL(new RegExp(`/events/${event.id}$`))
  // First hit of this route in a fresh dev server process — wait out
  // Next.js's on-demand compilation before clicking, or Fast Refresh can
  // swallow the click mid-remount. See CLAUDE.md's Playwright gotchas.
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/events$/)
})

test('an owner can create a multi-day event via the "Multiple days" checkbox', async ({ page }) => {
  const passwordHash = await hashPassword('owner-password-123')
  await testPrisma.user.create({ data: { name: 'Owner', email: 'multiday-owner@example.com', isOwner: true, passwordHash } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('multiday-owner@example.com')
  await page.getByLabel('Password', { exact: true }).fill('owner-password-123')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events\/new/)
  // First hit of this route in a fresh dev server process — see the
  // Fast Refresh note above.
  await page.waitForLoadState('networkidle')

  await page.getByPlaceholder('Event name').fill('Viikonloppukirppis')
  await page.getByLabel('Event date').fill('2026-09-15')
  await expect(page.getByLabel('Event end date')).not.toBeVisible()

  await page.getByRole('checkbox', { name: /multiple days/i }).check()
  await expect(page.getByLabel('Event end date')).toHaveValue('2026-09-16')

  await page.getByLabel('Registration deadline').fill('2026-09-01')
  await page.getByLabel('Item edit cutoff').fill('2026-09-10')
  await page.getByRole('button', { name: /create event/i }).click()

  await expect(page).toHaveURL(/\/events\/(?!new$)[^/]+$/)
  const event = await testPrisma.event.findFirstOrThrow({ where: { name: 'Viikonloppukirppis' } })
  expect(event.eventEndDate).toEqual(new Date('2026-09-16'))
})

test('creating a multi-day event rejects an end date before the start date', async ({ page }) => {
  const passwordHash = await hashPassword('owner-password-123')
  await testPrisma.user.create({ data: { name: 'Owner', email: 'baddate-owner@example.com', isOwner: true, passwordHash } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('baddate-owner@example.com')
  await page.getByLabel('Password', { exact: true }).fill('owner-password-123')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events\/new/)
  // First hit of this route in a fresh dev server process — see the
  // Fast Refresh note above.
  await page.waitForLoadState('networkidle')

  await page.getByPlaceholder('Event name').fill('Rikkinäinen kirppis')
  await page.getByLabel('Event date').fill('2026-09-15')
  await page.getByRole('checkbox', { name: /multiple days/i }).check()
  await page.getByLabel('Event end date').fill('2026-09-10')
  await page.getByLabel('Registration deadline').fill('2026-09-01')
  await page.getByLabel('Item edit cutoff').fill('2026-09-10')
  await page.getByRole('button', { name: /create event/i }).click()

  await expect(page.getByText(/end date must be on or after/i)).toBeVisible()
  await expect(page).toHaveURL(/\/events\/new/)
})
