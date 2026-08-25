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

- **Dependencies added:** shadcn/ui CLI-scaffolded primitives, which pull in the Radix packages each component needs (e.g. `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-checkbox`) plus `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` (icons). No new UI framework, no CSS-in-JS — everything renders through Tailwind v4, which the project already uses.
- **Theming:** `globals.css`'s `:root` block becomes the single dark palette (background, foreground, card, border, muted, accent, destructive, success — as CSS variables), consumed by the existing `@theme inline` mapping. shadcn's `components.json` is configured to use these CSS variables rather than its own default palette, so there's one source of truth for color, not two.
- **Shared layout:** new `app/(dashboard)/layout.tsx` wraps every page currently in that route group with a top bar (app name/logo mark, signed-in user email, sign-out button) and a consistent page-content container (max-width, padding). Today that route group has no shared layout at all — each page independently renders its own `<div className="p-8">`.
- **Component inventory:** Button, Input, Label, Select, Checkbox, Card, Table, Badge, Alert, Separator, Dialog/AlertDialog (destructive confirmations only — see constraint below).
- **`app/layout.tsx` / `app/page.tsx`:** metadata (`title`/`description`) updated to reflect the real app instead of the `create-next-app` placeholder; `app/page.tsx`'s content is restyled in place but keeps its current behavior (no redirect logic added — that's item 4).

## Constraint: checkout confirm stays keyboard-native, not a modal

`CheckoutScanner.tsx`'s confirm step ("Selling X, confirm?") is currently an inline `<div>` below the input, and the Enter key is handled by the input's own `onKeyDown` — focus never leaves the input across both lookup and confirm. This is how the spec's "confirm via Enter key, no mouse required" requirement is satisfied.

A Radix `Dialog`/`AlertDialog` traps focus and moves it into the dialog on open, which would break that flow (focus would leave the input, and a second Enter would no longer reach the handler that calls `confirmSale`). **Decision: the checkout confirm block is restyled using `Card` (not `Dialog`)**, preserving the existing inline-element structure and keyboard behavior exactly. `Dialog`/`AlertDialog` primitives are still added to the component set, but only used for genuinely modal, mouse-driven confirmations elsewhere (e.g. a destructive delete action), never for checkout.

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

- Playwright E2E specs (`tests/e2e/*.spec.ts`) and RTL component tests select primarily by role and visible text (button labels, headings), not CSS classes. Swapping raw `<button>`/`<input>` elements for shadcn equivalents preserves the same underlying semantic HTML (a shadcn `Button` still renders a `<button>`), so as long as visible text/labels are kept unchanged, existing tests are expected to keep passing without rewrites.
- No new test coverage is added for this pass (styling only, no new behavior to test) beyond running the existing suite to confirm nothing broke: `npm test` (unit/integration) and `npm run test:e2e` (Playwright) must both stay green before this is considered done.
- Manual pass: spot-check the checkout scanner's keyboard-only flow (scan/type code → Enter → confirm → Enter) still works with no mouse, since that's the one flow with a real behavioral constraint riding on the restyle.

## Housekeeping (adjacent, resolved during brainstorming)

An uncommitted, unrelated change to `tsconfig.json` (`"jsx": "react-jsx"` → `"jsx": "preserve"`, plus array reformatting) was found in the working tree at the start of this session — reverted before this work began, per user confirmation, as it looked accidental and would have broken the Next.js build.
