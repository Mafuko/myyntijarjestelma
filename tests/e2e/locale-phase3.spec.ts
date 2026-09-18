import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('the Unknown seller-alias fallback renders in Finnish on checkout and the sales dashboard', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner-phase3@example.com', isOwner: true, passwordHash: await hashPassword('owner-phase3-pw-1') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })

  // Staff member with no sellerAlias set -- the realistic path that triggers
  // the fallback, since staff/owner can list and sell their own items too
  // but sellerAlias is a seller-specific field on EventMembership.
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff-phase3@example.com', passwordHash: await hashPassword('staff-phase3-pw-1'), locale: 'fi' },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })
  const item = await testPrisma.item.create({
    data: { eventId: event.id, sellerId: staff.id, name: 'Staff-owned item', price: 4, categoryId: category.id, barcodeValue: 'STAFFCODE1' },
  })

  // Login page itself always renders in the default locale (no NEXT_LOCALE
  // cookie exists yet pre-login) -- matches the established pattern in
  // tests/e2e/locale.spec.ts and locale-phase2.spec.ts. The extra wait
  // guards against the documented dev-mode Fast-Refresh race on this route's
  // first hit in a fresh server process (see CLAUDE.md's known gotchas).
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('staff-phase3@example.com')
  await page.getByLabel('Password', { exact: true }).fill('staff-phase3-pw-1')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/checkout`)
  await page.waitForLoadState('networkidle')
  const input = page.getByPlaceholder('Skannaa tai kirjoita koodi ja paina Enter')
  await input.fill('STAFFCODE1')
  await input.press('Enter')
  await expect(page.getByText('Tuntematon')).toBeVisible()

  await page.goto(`/events/${event.id}/sales`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByText(/Staff-owned item.*Tuntematon/)).toBeVisible()

  const response = await page.request.get(`/api/price-tags/${event.id}?itemIds=${item.id}`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/pdf')
})
