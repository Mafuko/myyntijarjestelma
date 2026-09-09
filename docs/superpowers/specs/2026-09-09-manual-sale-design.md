# Manual Sale (Sell by Seller + Undo) — Design Spec

Status: **approved, pending implementation plan**
Source: user request, brainstormed and approved in-session on 2026-09-09.

## Problem

Today the only way to record a `Sale` is `CheckoutScanner` — scan or type a barcode, confirm. That requires the item to already have a `barcodeValue` and a working code path (scanner, printed tag, or a known code to type). There's no way for staff/admin to sell an item by simply browsing to "this seller's stuff" and clicking it, and no way at all to reverse a sale recorded by mistake (wrong item scanned, double-confirm, etc.) — the item stays `SOLD` forever with no undo.

The `Sale.method` enum already has an unused `MANUAL_OVERRIDE` value alongside `BARCODE_SCAN`/`MANUAL_CODE_ENTRY`, suggesting this was anticipated but never built.

## Scope decisions (from brainstorming)

- **Placement:** a second mode inside the existing Checkout page, not a separate page/route. Checkout gets two tabs: "Scan" (today's `CheckoutScanner`, completely untouched) and "Sell by seller" (new).
- **Undo semantics: full undo.** Reversing a sale deletes the `Sale` row and flips the item back to `LISTED`. It disappears from revenue/commission totals and can be sold again. No "voided but kept" trace record — YAGNI, and it mirrors how `recordSale` itself works in reverse.
- **Undo permissions: same as who can sell.** `['STAFF', 'ADMIN']` plus the existing global-owner bypass in `requireEventAccess` — no extra restriction on which sale or how old it is. Every undo here is inherently a staff/admin action (a seller never sees this flow), so it's audit-logged unconditionally rather than conditionally like `deleteItem`'s self-service-vs-admin split.
- **Data-fetching strategy: server-side snapshot, not lazy per-click fetches.** `checkout/page.tsx` fetches the full event item list (via the existing `listAllItemsForEvent`) and event memberships once, server-side, and passes them down as props. Grouping items by seller and switching between "seller list" and "that seller's items" happens entirely client-side from those props — no new fetch-on-select service calls. Rejected alternative: lazy `listSellersWithItems`/`listItemsForSellerAsStaff` calls triggered per click — more round trips and two more service functions, not justified at this app's scale (a single flea-market event, hundreds of items at most, not thousands).
- **Out of scope:** any reason/note field on undo, restricting undo to "only the most recent sale" or a time window, changing `CheckoutScanner`'s scan flow itself, real-time push updates beyond the existing `revalidatePath`-triggered refresh (the sales dashboard's SSE poll already picks up the reverted state on its next ~2s tick with no changes needed here).

## Architecture

**Service layer** (`lib/services/sales.ts`):

- New `undoSale(session, itemId)`, mirroring `recordSale`'s atomic-transaction shape in reverse:
  ```ts
  export async function undoSale(session: MinimalSession, itemId: string): Promise<Result<{ itemId: string }>> {
    const item = await prisma.item.findUnique({ where: { id: itemId } })
    if (!item) return { ok: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }

    const authz = await requireEventAccess(session, item.eventId, ['STAFF', 'ADMIN'])
    if (!authz.ok) return authz

    const sale = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.item.updateMany({ where: { id: itemId, status: 'SOLD' }, data: { status: 'LISTED' } })
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
  Same conditional-update-inside-a-transaction trick as `recordSale` (only flips `SOLD` → `LISTED` if it's still `SOLD`; a concurrent double-undo sees `count === 0` and returns `NOT_SOLD` instead of racing).

**Action layer** (`actions/sales.ts`):

- Widen `confirmSale`'s `method` parameter type to `'BARCODE_SCAN' | 'MANUAL_CODE_ENTRY' | 'MANUAL_OVERRIDE'` (the service function already accepts any `SaleMethod`; this is purely a type-signature change reflecting the new caller).
- New `undoSale(eventId, itemId)` action, following the existing `confirmSale` action's shape exactly (same try/catch-and-return-`UNEXPECTED_ERROR` defense-in-depth wrapper), revalidating both `/events/${eventId}/checkout` and `/events/${eventId}/sales`.

**Page/data layer** (`app/(dashboard)/events/[eventId]/checkout/page.tsx`):

- Alongside the existing `requireEventAccess` gate, also fetch:
  - `listAllItemsForEvent(session, eventId)` — already returns `{id, name, price, status, sellerId}` for every non-`REMOVED` item, already gated to `['STAFF','ADMIN']`.
  - `prisma.eventMembership.findMany({ where: { eventId }, include: { user: true } })` — for `sellerAlias ?? user.name` labels.
- Render `<CheckoutTabs eventId={eventId} items={items} memberships={memberships} />` instead of `<CheckoutScanner eventId={eventId} />` directly.

**New client component `CheckoutTabs.tsx`:**

- Two tab buttons, "Scan" and "Sell by seller"; local `mode` state.
- "Scan" renders the existing `CheckoutScanner` completely unchanged — no props change, no shared state with the new tab. This preserves the documented constraint that `CheckoutScanner` must never become a modal `Dialog` (focus must stay in its code input across two Enter presses) — switching tabs unmounts/remounts it via plain conditional rendering, not an overlay.
- "Sell by seller" renders the new `SellBySeller` component.

**New client component `SellBySeller.tsx`:**

- Props: `eventId`, `items` (from `listAllItemsForEvent`), `memberships` (for alias labels). No internal data fetching — everything is derived from props each render, so a `revalidatePath`-triggered refresh of the parent Server Component flows straight through.
- Local state: `selectedSellerId: string | null` only.
- **Seller list view** (`selectedSellerId === null`): group `items` by `sellerId`, label each group `membership.sellerAlias ?? membership.user.name` (`User.name` is non-nullable, so this always resolves), show listed/sold counts, sorted alphabetically by label. Clicking a row sets `selectedSellerId`.
- **Item list view** (a seller selected): a "back to sellers" control, then that seller's items using the same row look as the items page (name, price, status badge, action column):
  - `status === 'LISTED'` → "Sell" button → `confirmSale(eventId, itemId, 'MANUAL_OVERRIDE')`.
  - `status === 'SOLD'` → "Undo sale" button → `undoSale(eventId, itemId)`.
- Inline error display (small `Alert`, matching `ItemRow`'s pattern) for the `ALREADY_SOLD` / `NOT_SOLD` race-condition responses.

## Testing

- **Integration** (`tests/integration/sales.test.ts`, extending the existing `recordSale` test file):
  - `undoSale` happy path: a sold item reverts to `LISTED`, its `Sale` row is gone, and an `AuditLog` entry with action `SALE_REVERSED` exists.
  - `undoSale` rejects a `LISTED` (never-sold) item with `NOT_SOLD`.
  - `undoSale` rejects a non-staff/admin caller (e.g. a seller) with the existing `requireEventAccess` forbidden shape.
  - `undoSale` on a nonexistent item returns `NOT_FOUND`.
- **E2E** (`tests/e2e/checkout.spec.ts` or a new `manual-sale.spec.ts`): staff logs in, opens Checkout, switches to "Sell by seller", picks a seller, sells one of their items via the button (not the scanner), sees it move to `SOLD`, then undoes it and sees it back as `LISTED`.

## Housekeeping

- None — no new env vars, no schema migration (`MANUAL_OVERRIDE` and the `Sale`/`Item` shapes already exist), no `docs/next-steps.md` entry to close out since this wasn't tracked there.
