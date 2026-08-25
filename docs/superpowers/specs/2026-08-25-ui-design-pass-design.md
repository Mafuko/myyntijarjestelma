# UI Design Pass — Design Spec

Status: **approved, pending implementation plan**
Source: [docs/next-steps.md](../../next-steps.md) item 3 ("UI is a functional skeleton, not a finished design")
Prior spec: [2026-08-22-myyntijarjestelma-design.md](2026-08-22-myyntijarjestelma-design.md) (MVP build)

## Problem

The MVP (36 tasks, 11 sessions) is functionally complete and merged, but every page is styled with untouched `create-next-app` defaults: no color system, no shared layout, no reusable components, `app/layout.tsx` metadata still reads `"Create Next App"`. The original spec named dark mode as a stated UI preference; it was never implemented. This pass gives the app an actual visual design without changing any behavior.

## Scope decisions (from brainstorming)

- **Theme:** dark-only. No light theme, no toggle — the spec asked for dark mode, not theme switching, so a toggle is scope not requested. `globals.css`'s light/dark CSS-variable pair is replaced with a single dark palette; the `prefers-color-scheme` branch is removed.
- **Component approach:** [shadcn/ui](https://ui.shadcn.com) — Radix-based, Tailwind-styled, copy-in component source (lives in `components/ui/`, not an opaque dependency), CSS-variable theming that layers directly onto the existing `@theme inline` block in `globals.css`.
- **Visual identity:** proposed fresh (no existing branding to match) — dark neutral base (near-black slate, not pure black) with amber/orange as the accent color (marketplace/price-tag association, strong contrast on dark, distinct from default Tailwind blue). Status colors: green (sold/success), red (destructive/error), amber (K-18/warning badges, reusing the accent).
- **Navigation shell:** a top bar, not a sidebar — app name, current user, sign-out. Matches the app's shallow nav tree (Events → event detail → Items/Checkout/Sales/Members) and is the smaller responsive-layout lift.
- **Page coverage:** all 18 existing pages/forms in this one pass, not a prioritized subset — the app should be visually consistent end-to-end when this is done, not partially redesigned.
- **Out of scope:** any behavioral/routing change. Item 4 (`/` → `/login` routing) and item 5 (role/state-dependent post-login landing) from `next-steps.md` are separate, already-tracked items — not touched here beyond the minimum `app/page.tsx`/`app/layout.tsx` metadata cleanup needed so a design pass doesn't leave the literal `create-next-app` placeholder title in place.

## Architecture

- **Dependencies added:** shadcn/ui-pattern primitives for the component inventory below. Of that set, only `Label` pulls in a Radix package (`@radix-ui/react-label` — it renders a real `<label>`, so it doesn't affect the native-element constraints below); `Button`, `Input`, `Card`, `Table`, `Badge`, `Alert` are plain styled HTML with no Radix dependency. Plus `class-variance-authority`, `clsx`, `tailwind-merge` (shared by the variant-based components). No icon library — nothing in this pass's pages uses one. No new UI framework, no CSS-in-JS — everything renders through Tailwind v4, which the project already uses.
- **Theming:** `globals.css`'s `:root` block becomes the single dark palette (background, foreground, card, border, muted, accent, destructive, success — as CSS variables), consumed by the existing `@theme inline` mapping. shadcn's `components.json` is configured to use these CSS variables rather than its own default palette, so there's one source of truth for color, not two.
- **Shared layout:** new `app/(dashboard)/layout.tsx` wraps every page currently in that route group with a top bar (app name/logo mark, signed-in user email, sign-out button) and a consistent page-content container (max-width, padding). Today that route group has no shared layout at all — each page independently renders its own `<div className="p-8">`.
- **Component inventory:** Button, Input, Label, Card, Table, Badge, Alert — the set actually consumed once every page's exact markup was drafted for the implementation plan. No shadcn `Select`, `Checkbox`, `Dialog`, `AlertDialog`, or `Separator` (the last had no real call site across any of the 18 pages, so it was dropped rather than shipped unused) — see constraints below.
- **`app/layout.tsx` / `app/page.tsx`:** metadata (`title`/`description`) updated to reflect the real app instead of the `create-next-app` placeholder; `app/page.tsx`'s content is restyled in place but keeps its current behavior (no redirect logic added — that's item 4).

## Constraints found while writing the implementation plan

These correct two points in the "Component inventory" above — both discovered by cross-checking the existing E2E test suite (`tests/e2e/*.spec.ts`), which is the authoritative source for what DOM shape each form must keep.

**Checkout confirm stays keyboard-native, not a modal.**
`CheckoutScanner.tsx`'s confirm step ("Selling X, confirm?") is currently an inline `<div>` below the input, and the Enter key is handled by the input's own `onKeyDown` — focus never leaves the input across both lookup and confirm. This is how the spec's "confirm via Enter key, no mouse required" requirement is satisfied. A Radix `Dialog` traps focus and moves it into the dialog on open, which would break that flow. **Decision: the checkout confirm block is restyled using `Card` (not `Dialog`)**, preserving the existing inline-element structure and keyboard behavior exactly.

**No `Dialog`/`AlertDialog` anywhere in this pass.** The only other place a confirmation dialog might seem to fit is the two delete actions (item delete in `items/page.tsx`, "Delete PII" in `admin/page.tsx`) — but `tests/e2e/items.spec.ts:54-55` and `tests/e2e/pii-deletion.spec.ts:27-28` both click the delete button once and immediately assert the row is gone, with no confirm step. Both deletes are already plain `<form action={...}>` submits with no client-side confirm. Adding one would be a behavior change, which is out of scope ("styling only" — see Scope decisions above). Delete buttons are restyled (e.g. a destructive-variant `Button`) but keep their current one-click submit behavior. `Dialog`/`AlertDialog` are dropped from the component inventory entirely — nothing in this pass needs them.

**Category/role `<select>` and the K-18 `<input type="checkbox">` stay native elements**, not shadcn's `Select`/`Checkbox`. Those wrap Radix primitives that render as `<button role="combobox">` / `<button role="checkbox">` rather than a true `<select>` or `<input type="checkbox">`. Three E2E specs interact with these via native-element APIs — `page.selectOption('select[name="categoryId"]', ...)` and `page.locator('input[name="isAgeRestricted"]').check()` in `items-quickrepeat.spec.ts:43-53,67-68`, and `page.selectOption('select[name="role"]', 'SELLER')` in `events.spec.ts:34` — which only work against real form elements. **Decision:** style the native `<select>` and `<input type="checkbox">` directly with Tailwind utility classes (border/background/focus-ring colors matching the palette; `accent-*` utility for the checkbox's native tick color) instead of swapping in Radix-based components. `Select`/`Checkbox` are dropped from the component inventory.

## Page rollout

All pages restyled with the shared shell + new primitives, no behavior changes:

- Auth: `login`, `invite/[token]`
- Dashboard shell: new `(dashboard)/layout.tsx`
- Events: list, create form, detail, commission-update form
- Items: list, add form, quick-repeat behavior (unchanged), import form + preview
- Members: list, invite form
- Checkout: scanner screen (per constraint above)
- Sales: dashboard (SSE-driven live updates — visual only, polling/SSE logic untouched)
- Profile: page, payout-info form
- Admin, Audit

## Testing

- Playwright E2E specs (`tests/e2e/*.spec.ts`) and RTL component tests select primarily by role, label, placeholder, and visible text — not CSS classes. The primitives used (`Button`, `Input`, `Card`, `Table`, `Badge`, `Alert`, `Label`) all render the same underlying native element they replace (a shadcn `Button` is still a `<button>`), and `<select>`/checkbox stay native per the constraints above, so as long as visible text/labels/placeholders are kept unchanged, existing tests are expected to keep passing without rewrites.
- No new test coverage is added for this pass (styling only, no new behavior to test) beyond running the existing suite to confirm nothing broke: `npm test` (unit/integration) and `npm run test:e2e` (Playwright) must both stay green before this is considered done.
- Manual pass: spot-check the checkout scanner's keyboard-only flow (scan/type code → Enter → confirm → Enter) still works with no mouse, since that's the one flow with a real behavioral constraint riding on the restyle.

## Housekeeping (adjacent, resolved during brainstorming)

An uncommitted, unrelated change to `tsconfig.json` (`"jsx": "react-jsx"` → `"jsx": "preserve"`, plus array reformatting) was found in the working tree at the start of this session — reverted before this work began, per user confirmation, as it looked accidental and would have broken the Next.js build.
