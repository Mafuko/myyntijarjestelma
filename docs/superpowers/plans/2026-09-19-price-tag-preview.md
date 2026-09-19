# Price Tag Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking "Price tag" or "Print all price tags" on the items page now lands on a preview page showing the actual PDF inline, with an explicit Download action — instead of triggering an immediate download.

**Architecture:** Reuse the existing `generatePriceTagData` + `renderPriceTagsPdf` pipeline unchanged — no second rendering path. `app/api/price-tags/[eventId]/route.ts` gains a `download=1` query param that switches its `Content-Disposition` header between `inline` (default, for embedding) and `attachment` (explicit download). A new page, `app/(dashboard)/events/[eventId]/items/price-tags/page.tsx`, embeds that same route's `inline` response in an `<iframe>` and links to the `download=1` variant as the actual download action. The two existing links on the items page now point at this new page instead of the API route directly.

**Tech Stack:** Next.js 15 App Router, `next-intl` (already installed), Playwright (e2e).

**Design discussion:** brainstormed in-session on 2026-09-19 (bounded change, no separate spec file — see conversation). Key decisions: embed the real PDF rather than build a second HTML preview; a dedicated page rather than a new modal/dialog primitive (none exists in this codebase yet); the existing links change destination rather than adding a third link alongside them.

## Global Constraints

- No second PDF-rendering path — the preview must show the byte-identical output of the existing `renderPriceTagsPdf`, just with a different `Content-Disposition`.
- `actions/*.ts` files never call Prisma directly — not relevant here (no new Server Action), but the new page must go through `lib/services/price-tags.ts`'s `generatePriceTagData` for its own authz check, exactly like every other dashboard page (e.g. `sales/page.tsx`), not re-implement authorization inline.
- On any failure from `generatePriceTagData` (no items, forbidden, unauthenticated) or a missing/empty `itemIds` search param, the preview page redirects to `/events/[eventId]/items` — matching this app's established "redirect away on auth/data failure" pattern.
- Every English message value written in this plan is a new string (no existing UI text is being translated) — Finnish translations are provided directly in this plan; no separate "byte-identical to existing JSX" constraint applies since nothing pre-existing is being reworded, only the two links' `href` targets change (their visible text stays exactly as-is: "Price tag" / "Print all price tags").
- `NODE_OPTIONS='--require dotenv/config'` must prefix every direct `vitest`/`playwright` invocation. Confirm port 3000 has no stray server (`netstat -ano | grep :3000`, only `TIME_WAIT` is fine) before running Playwright. If `next dev`/`playwright test`/`next build` rewrites `tsconfig.json`, run `git checkout -- tsconfig.json` before committing — never commit that file's auto-rewrite noise.
- Known, accepted limitation (do not engineer around it): inline PDF rendering support varies slightly across mobile browsers. Acceptable for this desktop/tablet-centric staff tool.

---

## Task 1: Route disposition toggle, preview page, and link wiring

**Files:**
- Modify: `app/api/price-tags/[eventId]/route.ts`
- Create: `app/(dashboard)/events/[eventId]/items/price-tags/page.tsx`
- Modify: `app/(dashboard)/events/[eventId]/items/ItemRow.tsx`
- Modify: `app/(dashboard)/events/[eventId]/items/page.tsx`
- Modify: `messages/en.json`, `messages/fi.json`
- Modify: `tests/e2e/price-tags.spec.ts`
- Create: `tests/e2e/price-tag-preview.spec.ts`
- Modify: `docs/next-steps.md`

**Interfaces:**
- Consumes: `generatePriceTagData` from `@/lib/services/price-tags` (unchanged signature).
- Produces: no new exported functions — this task is routing/rendering plumbing plus one query-param behavior change on an existing Route Handler.

- [ ] **Step 1: Write the failing e2e assertions for the disposition toggle**

Modify `tests/e2e/price-tags.spec.ts` — add these two lines right after the existing `expect(body.subarray(0, 4).toString('utf-8')).toBe('%PDF')` line in the `'seller can download a price tag PDF for their own item'` test:

```ts
  expect(response.headers()['content-disposition']).toBe('inline; filename="price-tags.pdf"')

  const downloadResponse = await page.request.get(`/api/price-tags/${event.id}?itemIds=${item.id}&download=1`)
  expect(downloadResponse.headers()['content-disposition']).toBe('attachment; filename="price-tags.pdf"')
```

- [ ] **Step 2: Run it, verify it fails**

Confirm port 3000 is clear: `netstat -ano | grep :3000` (only `TIME_WAIT` is fine).

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test tests/e2e/price-tags.spec.ts`
Expected: FAIL — the route currently always returns `attachment`, so the first new assertion (`'inline; ...'`) fails.

- [ ] **Step 3: Implement the disposition toggle**

Full replacement of `app/api/price-tags/[eventId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { generatePriceTagData, renderPriceTagsPdf } from '@/lib/services/price-tags'

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const itemIdsParam = request.nextUrl.searchParams.get('itemIds')
  if (!itemIdsParam) {
    return NextResponse.json({ error: 'itemIds query parameter is required' }, { status: 400 })
  }
  const itemIds = itemIdsParam.split(',').filter(Boolean)
  const forceDownload = request.nextUrl.searchParams.get('download') === '1'

  const result = await generatePriceTagData(session, eventId, itemIds)
  if (!result.ok) {
    const status = result.error.code === 'UNAUTHENTICATED' ? 401 : result.error.code === 'FORBIDDEN' ? 403 : 400
    return NextResponse.json({ error: result.error.message }, { status })
  }

  const cookieStore = await cookies()
  const locale = cookieStore.get('NEXT_LOCALE')?.value === 'fi' ? 'fi' : 'en'
  const t = await getTranslations({ locale, namespace: 'Common' })

  const pdfBuffer = await renderPriceTagsPdf(result.data, t('unknownSeller'))
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${forceDownload ? 'attachment' : 'inline'}; filename="price-tags.pdf"`,
    },
  })
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test tests/e2e/price-tags.spec.ts`
Expected: PASS, both existing tests plus the two new assertions.

- [ ] **Step 5: Add the preview page's message strings**

Add to `messages/en.json`, as a new sibling namespace (do not touch any existing namespace):
```json
"PriceTagPreviewPage": {
  "title": "Price tag preview",
  "itemCount": "{count} item(s)",
  "downloadButton": "Download"
}
```

Add to `messages/fi.json`:
```json
"PriceTagPreviewPage": {
  "title": "Hintalappujen esikatselu",
  "itemCount": "{count} tuote(tta)",
  "downloadButton": "Lataa"
}
```

- [ ] **Step 6: Write the failing e2e test for the full preview flow**

`tests/e2e/price-tag-preview.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('clicking Price tag opens a preview page with an embedded PDF and a working download link', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const seller = await testPrisma.user.create({
    data: { name: 'Seller', email: 'seller@example.com', passwordHash: await hashPassword('seller-pw-12345') },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
  })
  const item = await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Manga Vol. 1', price: 5, categoryId: category.id },
  })

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('seller@example.com')
  await page.getByLabel('Password', { exact: true }).fill('seller-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/items`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Price tag' }).click()

  await expect(page).toHaveURL(new RegExp(`/events/${event.id}/items/price-tags\\?itemIds=${item.id}`))
  await expect(page.getByText('Price tag preview')).toBeVisible()
  await expect(page.getByText('1 item(s)')).toBeVisible()

  const iframe = page.locator('iframe')
  await expect(iframe).toHaveAttribute('src', `/api/price-tags/${event.id}?itemIds=${item.id}`)

  const downloadLink = page.getByRole('link', { name: 'Download' })
  await expect(downloadLink).toHaveAttribute('href', `/api/price-tags/${event.id}?itemIds=${item.id}&download=1`)

  const response = await page.request.get(`/api/price-tags/${event.id}?itemIds=${item.id}&download=1`)
  expect(response.headers()['content-disposition']).toBe('attachment; filename="price-tags.pdf"')
})

test('a seller with no access to an item is redirected away from its preview page', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner2@example.com', isOwner: true, passwordHash: await hashPassword('owner2-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const sellerA = await testPrisma.user.create({
    data: { name: 'Seller A', email: 'sellerA@example.com', passwordHash: await hashPassword('sellerA-pw-12345') },
  })
  const sellerB = await testPrisma.user.create({
    data: { name: 'Seller B', email: 'sellerB@example.com', passwordHash: await hashPassword('sellerB-pw-12345') },
  })
  await testPrisma.eventMembership.create({ data: { userId: sellerA.id, eventId: event.id, role: 'SELLER', status: 'ACTIVE' } })
  await testPrisma.eventMembership.create({ data: { userId: sellerB.id, eventId: event.id, role: 'SELLER', status: 'ACTIVE' } })
  const itemB = await testPrisma.item.create({
    data: { eventId: event.id, sellerId: sellerB.id, name: 'Item B', price: 3, categoryId: category.id },
  })

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('sellerA@example.com')
  await page.getByLabel('Password', { exact: true }).fill('sellerA-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/items/price-tags?itemIds=${itemB.id}`)
  await expect(page).toHaveURL(`/events/${event.id}/items`)
})
```

- [ ] **Step 7: Run it, verify it fails**

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test tests/e2e/price-tag-preview.spec.ts`
Expected: FAIL — the preview page route doesn't exist yet, and the items page's "Price tag" link still points directly at the API route.

- [ ] **Step 8: Create the preview page**

`app/(dashboard)/events/[eventId]/items/price-tags/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { generatePriceTagData } from '@/lib/services/price-tags'

export default async function PriceTagPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ itemIds?: string }>
}) {
  const { eventId } = await params
  const { itemIds: itemIdsParam } = await searchParams
  const itemIds = itemIdsParam ? itemIdsParam.split(',').filter(Boolean) : []

  if (itemIds.length === 0) redirect(`/events/${eventId}/items`)

  const session = await auth()
  const result = await generatePriceTagData(session, eventId, itemIds)
  if (!result.ok) redirect(`/events/${eventId}/items`)

  const t = await getTranslations('PriceTagPreviewPage')
  const src = `/api/price-tags/${eventId}?itemIds=${itemIds.join(',')}`

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('itemCount', { count: result.data.length })}</p>
      <iframe src={src} className="h-[70vh] w-full rounded-md border border-border" title={t('title')} />
      <a href={`${src}&download=1`} className="w-fit text-sm text-primary underline-offset-4 hover:underline">
        {t('downloadButton')}
      </a>
    </div>
  )
}
```

- [ ] **Step 9: Point the two existing links at the preview page**

In `app/(dashboard)/events/[eventId]/items/ItemRow.tsx`, change:
```tsx
            href={`/api/price-tags/${eventId}?itemIds=${item.id}`}
```
to:
```tsx
            href={`/events/${eventId}/items/price-tags?itemIds=${item.id}`}
```
(the `<a>` tag, its className, and `{t('priceTagLink')}` text stay exactly as they are — only the `href` value changes).

In `app/(dashboard)/events/[eventId]/items/page.tsx`, change:
```tsx
            href={`/api/price-tags/${eventId}?itemIds=${listedIds.join(',')}`}
```
to:
```tsx
            href={`/events/${eventId}/items/price-tags?itemIds=${listedIds.join(',')}`}
```
(same — only the `href` value changes, `{t('printAllPriceTags')}` and everything else stays as-is).

- [ ] **Step 10: Run it, verify it passes**

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test tests/e2e/price-tag-preview.spec.ts`
Expected: PASS, both tests.

- [ ] **Step 11: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all 149 existing tests pass (this task adds no vitest tests, only e2e).

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test`
Expected: all tests pass except any already-documented pre-existing flake in `events.spec.ts` (`net::ERR_ABORTED` dev-mode compile-race, tracked in `docs/next-steps.md`) — retry that one specifically once before treating it as a regression.

- [ ] **Step 12: Update `docs/next-steps.md`**

Replace item 4 in the `## Open` section:
```markdown
4. **Price tags download immediately instead of showing a preview first** — DONE
   - Shipped: "Price tag" and "Print all price tags" now open a preview page (`app/(dashboard)/events/[eventId]/items/price-tags/page.tsx`) showing the actual PDF inline in an `<iframe>`, with an explicit Download link. The existing API route (`app/api/price-tags/[eventId]/route.ts`) gained a `download=1` query param toggling `Content-Disposition` between `inline` (default, for the embed) and `attachment` (the real download) — no second rendering path.
   - Known, accepted limitation: inline PDF rendering support varies slightly across mobile browsers (notably older mobile Safari). Not engineered around, given this is a desktop/tablet-centric staff tool.
```

- [ ] **Step 13: Commit**

```bash
git checkout -- tsconfig.json
git add app/api/price-tags "app/(dashboard)/events/[eventId]/items" messages/en.json messages/fi.json tests/e2e/price-tags.spec.ts tests/e2e/price-tag-preview.spec.ts docs/next-steps.md
git commit -m "feat: preview price tags before downloading"
```
