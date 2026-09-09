import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('owner creates an event and invites a seller who can then see it', async ({ page, context }) => {
  const passwordHash = await hashPassword('owner-password-123')
  await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('owner@example.com')
  await page.getByLabel('Password', { exact: true }).fill('owner-password-123')
  await page.getByRole('button', { name: /log in/i }).click()
  // A zero-event owner is auto-redirected to /events/new — see the dedicated
  // redirect test below for that behavior in isolation.
  await expect(page).toHaveURL(/\/events\/new/)

  await page.getByPlaceholder('Event name').fill('Syyskirppis')
  await page.getByLabel('Event date').fill('2026-09-15')
  await page.getByLabel('Registration deadline').fill('2026-09-01')
  await page.getByLabel('Item edit cutoff').fill('2026-09-10')
  await page.getByRole('button', { name: /create event/i }).click()
  // Creating redirects straight to the new event's own page.
  await expect(page).toHaveURL(/\/events\/[^/]+$/)
  await expect(page.getByText('Syyskirppis')).toBeVisible()

  await page.getByRole('link', { name: /members/i }).click()

  await page.getByPlaceholder('Name').fill('Invited Seller')
  await page.getByPlaceholder('Email').fill('invitedseller@example.com')
  await page.selectOption('select[name="role"]', 'SELLER')
  await page.getByPlaceholder('Seller alias').fill('Kirppis-Liisa')
  await page.getByRole('button', { name: /^invite$/i }).click()

  // The invite Server Action resolves asynchronously; wait for the members
  // list (re-rendered via revalidatePath once the invite is persisted) to
  // show the new member before reading the database directly below —
  // otherwise this races the in-flight request and can read stale data.
  await expect(page.getByText('invitedseller@example.com')).toBeVisible()

  const invitedUser = await testPrisma.user.findUniqueOrThrow({ where: { email: 'invitedseller@example.com' } })
  expect(invitedUser.inviteToken).toBeTruthy()

  await context.clearCookies()
  await page.goto(`/invite/${invitedUser.inviteToken}`)
  await page.getByLabel('Password', { exact: true }).fill('seller-password-123')
  await page.getByRole('button', { name: /set password/i }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.getByLabel('Email').fill('invitedseller@example.com')
  await page.getByLabel('Password', { exact: true }).fill('seller-password-123')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)
  await expect(page.getByText('Syyskirppis')).toBeVisible()
})

test('an owner with zero events is redirected to /events/new; once one exists, /events shows the list instead', async ({ page }) => {
  const passwordHash = await hashPassword('owner-password-456')
  await testPrisma.user.create({ data: { name: 'Fresh Owner', email: 'fresh-owner@example.com', isOwner: true, passwordHash } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('fresh-owner@example.com')
  await page.getByLabel('Password', { exact: true }).fill('owner-password-456')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events\/new/)
  // /events/new is being visited (and thus compiled by the dev server) for
  // the first time in this test, unlike the sibling test above where it's
  // visited right after /events/[eventId] has already warmed up the same
  // route group — Next.js's on-demand dev-mode compilation triggers a Fast
  // Refresh remount shortly after this page loads, which can swallow a
  // click that lands mid-remount. Let the network settle before interacting.
  await page.waitForLoadState('networkidle')

  await page.getByPlaceholder('Event name').fill('Kevätkirppis')
  await page.getByLabel('Event date').fill('2026-09-15')
  await page.getByLabel('Registration deadline').fill('2026-09-01')
  await page.getByLabel('Item edit cutoff').fill('2026-09-10')
  await page.getByRole('button', { name: /create event/i }).click()
  await expect(page).toHaveURL(/\/events\/[^/]+$/)

  await page.goto('/events')
  await expect(page).toHaveURL(/\/events$/)
  await expect(page.getByText('Kevätkirppis')).toBeVisible()
})

test('a non-owner never lands on /events/new, even with zero events, and cannot reach it directly', async ({ page }) => {
  const passwordHash = await hashPassword('staff-pw-12345')
  await testPrisma.user.create({ data: { name: 'Staff No Events', email: 'staff-noevents@example.com', passwordHash } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('staff-noevents@example.com')
  await page.getByLabel('Password', { exact: true }).fill('staff-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events$/)

  await page.goto('/events/new')
  await expect(page).toHaveURL(/\/events$/)
})

test('a staff member can follow My items to list and edit their own items, not just delete them', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff-myitems@example.com', passwordHash: await hashPassword('staff-pw-12345') },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('staff-myitems@example.com')
  await page.getByLabel('Password', { exact: true }).fill('staff-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}`)
  await page.getByRole('link', { name: /^my items$/i }).click()
  // Following the link must land on the items page itself, not bounce back
  // to the unscoped /events list — that redirect was the reported bug.
  await expect(page).toHaveURL(new RegExp(`/events/${event.id}/items$`))

  const addItemForm = page.locator('form').filter({ has: page.getByPlaceholder('Item name') })
  await addItemForm.getByPlaceholder('Item name').fill('Staff item')
  await addItemForm.getByPlaceholder('Price', { exact: true }).fill('5')
  await page.getByRole('button', { name: /add item/i }).click()
  await expect(page.getByText('Staff item')).toBeVisible()

  await page.getByRole('button', { name: /^edit$/i }).click()
  const editForm = page.getByTestId('item-edit-form')
  await editForm.getByPlaceholder('Price', { exact: true }).fill('7')
  await editForm.getByRole('button', { name: /^save$/i }).click()
  await expect(page.getByText('7 €')).toBeVisible()
})
