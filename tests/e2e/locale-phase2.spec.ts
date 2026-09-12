import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('Finnish locale renders across events list, items page, and members page', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: {
      name: 'Owner', email: 'owner-phase2@example.com', isOwner: true,
      passwordHash: await hashPassword('owner-phase2-pw-123'), locale: 'fi',
    },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  await testPrisma.item.create({
    data: { eventId: event.id, sellerId: owner.id, name: 'Manga Vol. 1', price: 5, categoryId: category.id },
  })

  // Login page itself always renders in the default locale (no NEXT_LOCALE
  // cookie exists yet pre-login) — matches the established pattern in
  // tests/e2e/locale.spec.ts. Post-login pages read the cookie set from the
  // DB user's locale after a successful sign-in, which is where the Finnish
  // assertions below kick in.
  await page.goto('/login')
  await page.getByLabel('Email').fill('owner-phase2@example.com')
  await page.getByLabel('Password', { exact: true }).fill('owner-phase2-pw-123')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  // Events list page
  await expect(page.getByText('Tapahtumat')).toBeVisible()

  await page.goto(`/events/${event.id}`)
  await expect(page.getByRole('link', { name: 'Jäsenet' })).toBeVisible()

  // Items page: title, status badge, and the Edit/Delete/Price-tag row actions
  await page.goto(`/events/${event.id}/items`)
  await expect(page.getByText('Omat tuotteet')).toBeVisible()
  await expect(page.getByText('Listattu')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Muokkaa' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Poista' })).toBeVisible()

  // Members page: column headers and the invite form's role dropdown, which
  // must still submit the underlying English enum value despite the visible
  // Finnish label.
  await page.goto(`/events/${event.id}/members`)
  await expect(page.getByText('Kutsu jäsen')).toBeVisible()
  await page.selectOption('select[name="role"]', 'SELLER')
  await expect(page.locator('select[name="role"]')).toHaveValue('SELLER')
})
