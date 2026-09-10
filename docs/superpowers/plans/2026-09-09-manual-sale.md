# Manual Sale (Sell by Seller + Undo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff/admin sell an item by browsing to a seller's item list and clicking "Sell" (no barcode required), and undo a mistaken sale.

**Architecture:** A new `undoSale` service function mirrors `recordSale`'s atomic transaction in reverse. The existing Checkout page gains a "Sell by seller" tab (alongside the untouched barcode-scan tab) that groups the event's items by seller client-side from a single server-fetched snapshot, with a Sell/Undo button per item.

**Tech Stack:** Next.js 15 Server Actions, Prisma, Vitest (unit/integration), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-09-09-manual-sale-design.md`

## Global Constraints

- Services return `Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }` — never throw for expected failures (see `CLAUDE.md`).
- Authorization for both selling and undoing is `requireEventAccess(session, eventId, ['STAFF', 'ADMIN'])` (the global-owner bypass in `requireEventAccess` already covers `OWNER`) — no extra restriction on which sale or how old it is.
- Undo is a **full undo**: delete the `Sale` row and flip the item back to `LISTED`. No "voided but kept" record.
- `CheckoutScanner.tsx` must not be modified — it must never become a modal `Dialog` (focus must stay in its code input across two Enter presses); the new tab is a sibling, not an overlay.
- `NODE_OPTIONS='--require dotenv/config'` must prefix every direct `vitest`/`playwright` invocation (Vitest/Playwright don't auto-load `.env` the way Next.js does).
- Before running Playwright, confirm port 3000 has no stray server (`netstat -ano | grep :3000`, only `TIME_WAIT` is fine).

---

## Task 1: `undoSale` service function

**Files:**
- Modify: `lib/services/sales.ts` (append after line 72)
- Test: `tests/integration/sales.test.ts`

**Interfaces:**
- Consumes: `requireEventAccess` from `@/lib/services/authz` (already imported in this file), `writeAuditLog` from `@/lib/services/audit` (not yet imported in this file — add it).
- Produces: `undoSale(session: MinimalSession, itemId: string): Promise<Result<{ itemId: string }>>`, exported from `lib/services/sales.ts`. Error codes: `NOT_FOUND` (no such item), `FORBIDDEN`/`UNAUTHENTICATED` (via `requireEventAccess`), `NOT_SOLD` (item isn't currently `SOLD`).

- [ ] **Step 1: Write the failing integration tests**

Add `undoSale` to the existing import line at the top of `tests/integration/sales.test.ts`:

```ts
import { lookupItemByCode, recordSale, undoSale } from '@/lib/services/sales'
```

Then append this new `describe` block at the end of the file (after the closing `})` of the existing `describe('recordSale', ...)` block):

```ts
describe('undoSale', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('reverts a sold item back to LISTED, deletes the Sale, and writes an audit log', async () => {
    const { staff, item } = await setup()
    const sold = await recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN')
    if (!sold.ok) throw new Error('setup failed')

    const result = await undoSale(sessionFor(staff.id), item.id)
    expect(result.ok).toBe(true)

    const updated = await testPrisma.item.findUniqueOrThrow({ where: { id: item.id } })
    expect(updated.status).toBe('LISTED')

    const sale = await testPrisma.sale.findUnique({ where: { itemId: item.id } })
    expect(sale).toBeNull()

    const log = await testPrisma.auditLog.findFirst({ where: { action: 'SALE_REVERSED', targetId: item.id } })
    expect(log?.actorUserId).toBe(staff.id)
  })

  it('rejects undoing a sale for an item that was never sold', async () => {
    const { staff, item } = await setup()
    const result = await undoSale(sessionFor(staff.id), item.id)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_SOLD')
  })

  it('rejects a seller trying to undo a sale (staff/admin only)', async () => {
    const { seller, staff, item } = await setup()
    const sold = await recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN')
    if (!sold.ok) throw new Error('setup failed')

    const result = await undoSale(sessionFor(seller.id), item.id)
    expect(result.ok).toBe(false)
  })

  it('returns NOT_FOUND for a nonexistent item', async () => {
    const { staff } = await setup()
    const result = await undoSale(sessionFor(staff.id), 'does-not-exist')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/integration/sales.test.ts`
Expected: FAIL — `undoSale` is not exported from `@/lib/services/sales`.

(Requires local Postgres running: `docker-compose up -d`, and the test DB schema migrated once via `DATABASE_URL="<value of DATABASE_URL_TEST>" npx prisma migrate deploy` if not already done in this environment.)

- [ ] **Step 3: Write the minimal implementation**

Add this import at the top of `lib/services/sales.ts` (alongside the existing `requireEventAccess` import):

```ts
import { writeAuditLog } from '@/lib/services/audit'
```

Append this function at the end of `lib/services/sales.ts`:

```ts
export async function undoSale(session: MinimalSession, itemId: string): Promise<Result<{ itemId: string }>> {
  const item = await prisma.item.findUnique({ where: { id: itemId } })
  if (!item) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }
  }

  const authz = await requireEventAccess(session, item.eventId, ['STAFF', 'ADMIN'])
  if (!authz.ok) return authz

  const sale = await prisma.$transaction(async (tx) => {
    // Atomic conditional update, mirroring recordSale's own guard: only flips
    // SOLD -> LISTED if it is still SOLD, so a concurrent double-undo sees
    // count === 0 and returns NOT_SOLD instead of racing.
    const updateResult = await tx.item.updateMany({
      where: { id: itemId, status: 'SOLD' },
      data: { status: 'LISTED' },
    })
    if (updateResult.count === 0) return null

    const existing = await tx.sale.findUniqueOrThrow({ where: { itemId } })
    await tx.sale.delete({ where: { itemId } })
    return existing
  })

  if (!sale) {
    return { ok: false, error: { code: 'NOT_SOLD', message: 'This item is not currently sold' } }
  }

  await writeAuditLog({
    actorUserId: authz.userId,
    action: 'SALE_REVERSED',
    targetType: 'Item',
    targetId: itemId,
    metadata: { originalSaleId: sale.id, originalSoldByUserId: sale.soldByUserId, method: sale.method },
  })

  return { ok: true, data: { itemId } }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/integration/sales.test.ts`
Expected: PASS (all tests in the file, including the pre-existing `lookupItemByCode`/`recordSale` ones).

- [ ] **Step 5: Commit**

```bash
git add lib/services/sales.ts tests/integration/sales.test.ts
git commit -m "feat: add undoSale service to reverse a mistaken sale"
```

---

## Task 2: `undoSale` action + widen `confirmSale`'s method type

**Files:**
- Modify: `actions/sales.ts`
- Test: `tests/unit/actions/sales.test.ts`

**Interfaces:**
- Consumes: `undoSale` from `@/lib/services/sales` (Task 1).
- Produces: `undoSale(eventId: string, itemId: string): Promise<Result<{ itemId: string }>>`, exported from `actions/sales.ts`. `confirmSale`'s `method` parameter now accepts `'BARCODE_SCAN' | 'MANUAL_CODE_ENTRY' | 'MANUAL_OVERRIDE'` (was missing `'MANUAL_OVERRIDE'`).

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/actions/sales.test.ts`, change the `vi.mock('@/lib/services/sales', ...)` line near the top to also mock `undoSale`:

```ts
vi.mock('@/lib/services/sales', () => ({ lookupItemByCode: vi.fn(), recordSale: vi.fn(), undoSale: vi.fn() }))
```

Append this new `describe` block at the end of the file:

```ts
describe('undoSale action', () => {
  it('forwards the session and itemId to the service, and revalidates checkout + sales on success', async () => {
    const { undoSale } = await import('@/actions/sales')
    const { undoSale: undoSaleService } = await import('@/lib/services/sales')
    const { revalidatePath } = await import('next/cache')
    vi.mocked(undoSaleService).mockResolvedValueOnce({ ok: true, data: { itemId: 'item-1' } })

    const result = await undoSale('evt-1', 'item-1')

    expect(result.ok).toBe(true)
    expect(undoSaleService).toHaveBeenCalledWith({ user: { id: 'staff-1' } }, 'item-1')
    expect(revalidatePath).toHaveBeenCalledWith('/events/evt-1/checkout')
    expect(revalidatePath).toHaveBeenCalledWith('/events/evt-1/sales')
  })

  it('returns UNEXPECTED_ERROR instead of throwing when the service rejects', async () => {
    const { undoSale } = await import('@/actions/sales')
    const { undoSale: undoSaleService } = await import('@/lib/services/sales')
    vi.mocked(undoSaleService).mockRejectedValueOnce(new Error('boom'))

    const result = await undoSale('evt-1', 'item-1')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNEXPECTED_ERROR')
      expect(result.error.message).toBe('Something went wrong undoing that sale. Please try again.')
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/actions/sales.test.ts`
Expected: FAIL — `undoSale` is not exported from `@/actions/sales`, and the mock factory references a property that doesn't exist yet on the real module.

- [ ] **Step 3: Write the minimal implementation**

In `actions/sales.ts`, change the import line to also bring in the service's `undoSale` (aliased to avoid a name collision with this file's own `undoSale` export):

```ts
import { lookupItemByCode, recordSale as recordSaleService, undoSale as undoSaleService } from '@/lib/services/sales'
```

Widen `confirmSale`'s `method` parameter type and add a second `revalidatePath` call so the Checkout page's own server-fetched item snapshot (added in Task 4) refreshes after a manual sale too:

```ts
export async function confirmSale(
  eventId: string,
  itemId: string,
  method: 'BARCODE_SCAN' | 'MANUAL_CODE_ENTRY' | 'MANUAL_OVERRIDE'
): Promise<Result<{ saleId: string }>> {
  const session = await auth()

  try {
    const result = await recordSaleService(session, itemId, method)
    if (result.ok) {
      revalidatePath(`/events/${eventId}/sales`)
      revalidatePath(`/events/${eventId}/checkout`)
    }
    return result
  } catch {
    return {
      ok: false,
      error: { code: 'UNEXPECTED_ERROR', message: 'Something went wrong recording the sale. Please try again.' },
    }
  }
}
```

Append this new action at the end of `actions/sales.ts`:

```ts
export async function undoSale(eventId: string, itemId: string): Promise<Result<{ itemId: string }>> {
  const session = await auth()

  try {
    const result = await undoSaleService(session, itemId)
    if (result.ok) {
      revalidatePath(`/events/${eventId}/checkout`)
      revalidatePath(`/events/${eventId}/sales`)
    }
    return result
  } catch {
    // Same defense-in-depth as confirmSale above: guard the Server Action's
    // contract of never throwing across the server/client boundary.
    return {
      ok: false,
      error: { code: 'UNEXPECTED_ERROR', message: 'Something went wrong undoing that sale. Please try again.' },
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/actions/sales.test.ts`
Expected: PASS.

Then run the full unit+integration suite once to confirm nothing else broke (`confirmSale`'s signature/behavior changed):

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add actions/sales.ts tests/unit/actions/sales.test.ts
git commit -m "feat: add undoSale action, widen confirmSale to accept MANUAL_OVERRIDE"
```

---

## Task 3: `SellBySeller` component

**Files:**
- Create: `app/(dashboard)/events/[eventId]/checkout/SellBySeller.tsx`

**Interfaces:**
- Consumes: `confirmSale`, `undoSale` from `@/actions/sales` (Task 2); `Button` from `@/components/ui/button` (variants: `default`, `destructive`, `outline`; sizes: `default`, `sm`, `lg`); `Badge` from `@/components/ui/badge` (variants: `secondary`, `success`, `destructive`); `Alert`/`AlertDescription` from `@/components/ui/alert` (variant `destructive` used here).
- Produces: `SellBySeller({ eventId, items, sellers }: { eventId: string; items: Item[]; sellers: SellerLabel[] })` where `type Item = { id: string; name: string; price: string; status: string; sellerId: string }` and `type SellerLabel = { userId: string; label: string }`. Both types are also exported from this file (`export type Item`, `export type SellerLabel`) so Task 4's `CheckoutTabs.tsx` can reuse them instead of redefining.

No unit test for this task — this codebase has no component-level unit tests for any client component (`AddItemForm`, `ItemRow`, `DeleteItemButton`, etc. all rely on Playwright e2e coverage instead). This component is exercised by Task 5's e2e test.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useMemo, useState, useTransition } from 'react'
import { confirmSale, undoSale } from '@/actions/sales'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

export type Item = { id: string; name: string; price: string; status: string; sellerId: string }
export type SellerLabel = { userId: string; label: string }

function SellableItemRow({ eventId, item }: { eventId: string; item: Item }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSell() {
    startTransition(async () => {
      const result = await confirmSale(eventId, item.id, 'MANUAL_OVERRIDE')
      setError(result.ok ? null : result.error.message)
    })
  }

  function handleUndo() {
    startTransition(async () => {
      const result = await undoSale(eventId, item.id)
      setError(result.ok ? null : result.error.message)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-[2fr_0.6fr_0.8fr_1fr] sm:items-center sm:gap-3 rounded-md px-3 py-2.5">
        <span className="min-w-0 break-words text-foreground">{item.name}</span>
        <span className="text-foreground">{item.price} €</span>
        <Badge variant={item.status === 'SOLD' ? 'success' : 'secondary'} className="w-fit">
          {item.status}
        </Badge>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {item.status === 'LISTED' && (
            <Button type="button" size="sm" disabled={pending} onClick={handleSell}>
              {pending ? 'Selling…' : 'Sell'}
            </Button>
          )}
          {item.status === 'SOLD' && (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleUndo}>
              {pending ? 'Undoing…' : 'Undo sale'}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export function SellBySeller({
  eventId,
  items,
  sellers,
}: {
  eventId: string
  items: Item[]
  sellers: SellerLabel[]
}) {
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)

  const sellerRows = useMemo(() => {
    return sellers
      .map((s) => {
        const theirItems = items.filter((i) => i.sellerId === s.userId)
        return {
          userId: s.userId,
          label: s.label,
          listedCount: theirItems.filter((i) => i.status === 'LISTED').length,
          soldCount: theirItems.filter((i) => i.status === 'SOLD').length,
        }
      })
      .filter((s) => s.listedCount + s.soldCount > 0)
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [sellers, items])

  if (selectedSellerId === null) {
    return (
      <div className="flex flex-col gap-1">
        {sellerRows.length === 0 && (
          <p className="text-sm text-muted-foreground">No items listed yet.</p>
        )}
        {sellerRows.map((s) => (
          <button
            key={s.userId}
            type="button"
            onClick={() => setSelectedSellerId(s.userId)}
            className="flex items-center justify-between rounded-md px-3 py-2.5 text-left text-foreground hover:bg-muted"
          >
            <span>{s.label}</span>
            <span className="text-sm text-muted-foreground">
              {s.listedCount} listed, {s.soldCount} sold
            </span>
          </button>
        ))}
      </div>
    )
  }

  const selectedSeller = sellers.find((s) => s.userId === selectedSellerId)
  const theirItems = items.filter((i) => i.sellerId === selectedSellerId)

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setSelectedSellerId(null)}
      >
        ← Back to sellers
      </Button>
      <h2 className="text-lg font-semibold text-foreground">{selectedSeller?.label}</h2>
      <div className="flex flex-col gap-1">
        {theirItems.map((item) => (
          <SellableItemRow key={item.id} eventId={eventId} item={item} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (this component isn't wired into any page yet, but it must compile standalone).

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/events/[eventId]/checkout/SellBySeller.tsx"
git commit -m "feat: add SellBySeller component for manual, no-barcode sales"
```

---

## Task 4: `CheckoutTabs` component + wire `checkout/page.tsx`

**Files:**
- Create: `app/(dashboard)/events/[eventId]/checkout/CheckoutTabs.tsx`
- Modify: `app/(dashboard)/events/[eventId]/checkout/page.tsx`

**Interfaces:**
- Consumes: `CheckoutScanner` from `./CheckoutScanner` (unchanged, existing); `SellBySeller`, `Item`, `SellerLabel` from `./SellBySeller` (Task 3); `listAllItemsForEvent` from `@/lib/services/items` (already exists — returns `Array<{ id: string; name: string; price: string; status: string; sellerId: string }>`, matching the `Item` shape exactly); `prisma` from `@/lib/db`.
- Produces: `CheckoutTabs({ eventId, items, sellers }: { eventId: string; items: Item[]; sellers: SellerLabel[] })`, default export of `page.tsx` now fetches and passes this data instead of rendering `CheckoutScanner` directly.

- [ ] **Step 1: Write `CheckoutTabs.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { CheckoutScanner } from './CheckoutScanner'
import { SellBySeller, type Item, type SellerLabel } from './SellBySeller'
import { Button } from '@/components/ui/button'

export function CheckoutTabs({
  eventId,
  items,
  sellers,
}: {
  eventId: string
  items: Item[]
  sellers: SellerLabel[]
}) {
  const [mode, setMode] = useState<'scan' | 'browse'>('scan')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'scan' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('scan')}
        >
          Scan
        </Button>
        <Button
          type="button"
          variant={mode === 'browse' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('browse')}
        >
          Sell by seller
        </Button>
      </div>
      {mode === 'scan' ? (
        <CheckoutScanner eventId={eventId} />
      ) : (
        <SellBySeller eventId={eventId} items={items} sellers={sellers} />
      )}
    </div>
  )
}
```

Note: `CheckoutScanner` keeps rendering its own `<h1>Checkout</h1>` exactly as it does today (it is not modified). The "Sell by seller" tab intentionally has no duplicate page-level heading — this is a deliberate, minor cosmetic asymmetry, not an oversight, to keep `CheckoutScanner.tsx` completely untouched per the spec's constraint.

- [ ] **Step 2: Rewrite `checkout/page.tsx`**

Replace the full contents of `app/(dashboard)/events/[eventId]/checkout/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { listAllItemsForEvent } from '@/lib/services/items'
import { CheckoutTabs } from './CheckoutTabs'

export default async function CheckoutPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['STAFF', 'ADMIN'])
  if (!authz.ok) redirect('/events')

  const [itemsResult, memberships] = await Promise.all([
    listAllItemsForEvent(session, eventId),
    prisma.eventMembership.findMany({
      where: { eventId },
      select: { userId: true, sellerAlias: true, user: { select: { name: true } } },
    }),
  ])
  const items = itemsResult.ok ? itemsResult.data : []
  const sellers = memberships.map((m) => ({ userId: m.userId, label: m.sellerAlias ?? m.user.name }))

  return <CheckoutTabs eventId={eventId} items={items} sellers={sellers} />
}
```

The `select` (rather than `include: { user: true }`) is deliberate: this is a Server Component passing props to a `'use client'` tree, so only `userId`/`sellerAlias`/`user.name` ever leave the server — no email, password hash, or IBAN ciphertext gets serialized into the client bundle.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manually smoke-test in the browser**

Run: `npm run dev`, then as a STAFF or ADMIN user (or the owner), visit `/events/<eventId>/checkout`. Confirm:
- The "Scan" tab looks and behaves exactly as before.
- The "Sell by seller" tab shows a list of sellers with listed/sold counts; clicking one shows their items; clicking "Sell" on a `LISTED` item flips it to `SOLD` with an "Undo sale" button in its place; clicking that reverts it to `LISTED`.

Stop the dev server afterward, and run `git checkout -- tsconfig.json` if `next dev` rewrote it (a known, harmless side effect noted in `CLAUDE.md`).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/events/[eventId]/checkout/CheckoutTabs.tsx" "app/(dashboard)/events/[eventId]/checkout/page.tsx"
git commit -m "feat: wire Sell-by-seller tab into the Checkout page"
```

---

## Task 5: End-to-end test

**Files:**
- Create: `tests/e2e/manual-sale.spec.ts`

**Interfaces:**
- Consumes: `testPrisma`, `resetDb` from `../integration/setup`; `hashPassword` from `../../lib/crypto` (same imports every other e2e spec in this repo uses, e.g. `tests/e2e/checkout.spec.ts`).

- [ ] **Step 1: Write the e2e test**

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

test('staff sells an item by browsing to its seller, then undoes the sale', async ({ page }) => {
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
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller-manual@example.com', passwordHash: 'x' } })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kirppis-Kalle', status: 'ACTIVE' },
  })
  await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Manga Vol. 1', price: 5, categoryId: category.id },
  })
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff-manual@example.com', passwordHash: await hashPassword('staff-pw-12345') },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('staff-manual@example.com')
  await page.getByLabel('Password', { exact: true }).fill('staff-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/checkout`)
  await page.getByRole('button', { name: /sell by seller/i }).click()
  await page.getByText('Kirppis-Kalle').click()
  await expect(page.getByText('Manga Vol. 1')).toBeVisible()

  await page.getByRole('button', { name: /^sell$/i }).click()
  await expect(page.getByRole('button', { name: /undo sale/i })).toBeVisible()

  const sold = await testPrisma.item.findFirstOrThrow({ where: { eventId: event.id, name: 'Manga Vol. 1' } })
  expect(sold.status).toBe('SOLD')
  const sale = await testPrisma.sale.findUnique({ where: { itemId: sold.id } })
  expect(sale?.method).toBe('MANUAL_OVERRIDE')

  await page.getByRole('button', { name: /undo sale/i }).click()
  await expect(page.getByRole('button', { name: /^sell$/i })).toBeVisible()

  const reverted = await testPrisma.item.findUniqueOrThrow({ where: { id: sold.id } })
  expect(reverted.status).toBe('LISTED')
  expect(await testPrisma.sale.findUnique({ where: { itemId: sold.id } })).toBeNull()
})
```

- [ ] **Step 2: Run it to verify it passes**

Confirm port 3000 is clear first: `netstat -ano | grep :3000` (only `TIME_WAIT` is fine).

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test tests/e2e/manual-sale.spec.ts`
Expected: PASS.

If it fails on the very first interaction with a brand-new route (dev-mode first-visit compile race, documented in `CLAUDE.md`), add `await page.waitForLoadState('networkidle')` right after `page.goto(`/events/${event.id}/checkout`)` and retry once before treating it as a real bug.

- [ ] **Step 3: Run the full test suite once**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run` (expect all pass) then `NODE_OPTIONS='--require dotenv/config' npx playwright test` (expect all pass; re-run any single flake once per the dev-mode compile-race note above before treating it as a regression).

Clean up: `rm -rf test-results` and `git checkout -- tsconfig.json` if either was touched by the run.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/manual-sale.spec.ts
git commit -m "test: add e2e coverage for manual sell-by-seller and undo"
```
