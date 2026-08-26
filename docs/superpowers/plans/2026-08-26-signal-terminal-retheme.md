# Signal/Terminal Retheme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's current amber/slate dark theme with a new phosphor-green palette and Sora/JetBrains Mono typography (Signal's structure + Terminal's colors, per the design-canvas exploration), and restructure the items and members pages into Signal's two-column list+form layout.

**Architecture:** Palette and font changes are pure CSS-variable/token substitutions in `app/globals.css` and `app/layout.tsx` — every existing component already consumes these tokens (`bg-primary`, `text-foreground`, etc.), so they cascade automatically with zero per-page code changes for 16 of the app's 18 pages. `Badge` and `TableHead` get `font-mono` baked into their base classNames so every existing usage picks it up with no call-site changes. Only the items and members pages get actual JSX restructuring, into a two-column CSS grid.

**Tech Stack:** Next.js 15, Tailwind v4 (unchanged), `next/font/google` (Sora, JetBrains_Mono replacing Geist, Geist_Mono).

**Spec:** `docs/superpowers/specs/2026-08-26-signal-terminal-retheme-design.md`

## Global Constraints

- All new palette values below are final, already contrast-verified (WCAG relative-luminance ratios computed, not eyeballed) — use them exactly, do not substitute different hex values.
- Styling and layout only. No behavioral changes anywhere — same rule as the prior UI pass.
- Category/role `<select>` and the K-18 `<input type="checkbox">` in `AddItemForm.tsx`/`AddSeriesForm.tsx`/`InviteMemberForm.tsx` are **not touched by this plan** — those files are not modified at all, only the pages that render them.
- No confirmation dialogs added anywhere (unrelated to this plan, but the item/PII delete flows are visually present on the items page task — do not add one).
- Every visible string an E2E/RTL test depends on (button text, labels, placeholders, item/member text content) must be preserved exactly through the items/members restructuring.
- `NODE_OPTIONS='--require dotenv/config'` is required for every `npm test`/`npx playwright test` invocation on this machine (long-form `--require`, not `-r`). Check port 3000 for a stray listener before each Playwright run. Revert `tsconfig.json`'s auto-rewrite (`git checkout -- tsconfig.json`) after any `npm run dev`/`npm run build`/Playwright run, before committing.
- `npm test` and `npm run test:e2e` must both be green before the plan is considered done (Task 6).

---

## Task 1: Palette and font foundation

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: the same Tailwind color utility names as before (`bg-background`, `text-foreground`, `bg-primary`, etc.) now resolving to the new phosphor-green palette — every later task and every untouched page consumes these automatically. `font-sans` now resolves to Sora, `font-mono` to JetBrains Mono.

- [ ] **Step 1: Replace the palette in `app/globals.css`**

Replace the `:root` block's color declarations (keep `color-scheme: dark;` as the first line, unchanged):

```css
:root {
  color-scheme: dark;
  --background: #08090a;
  --foreground: #d8f5e3;
  --card: #0e1310;
  --card-foreground: #d8f5e3;
  --border: #527560;
  --input: #527560;
  --ring: #34e37a;
  --muted: #0e1310;
  --muted-foreground: #6b8f7a;
  --primary: #34e37a;
  --primary-foreground: #08090a;
  --secondary: #0e1310;
  --secondary-foreground: #b8ddc4;
  --destructive: #d92222;
  --destructive-foreground: #fef2f2;
  --destructive-text: #f87171;
  --success: #2dd4bf;
  --success-foreground: #08090a;
  --warning: #f5a623;
  --warning-foreground: #08090a;
}
```

The `@theme inline` block below it (the `--color-*`/`--font-*` mappings) and the `body` rule stay **exactly as they are** — they reference the `:root` variables by name, not by value, so they don't need to change.

- [ ] **Step 2: Swap the loaded fonts in `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Myyntijärjestelmä",
  description: "Myynninhallinta pihakirppis-tapahtumille",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

Note: the CSS variable names (`--font-geist-sans`, `--font-geist-mono`) are kept as-is deliberately — `globals.css`'s `@theme inline` block already maps `--font-sans`/`--font-mono` to those exact variable names, so keeping them means `globals.css` needs no matching edit. Only the imported font functions and local variable names (`sora`, `jetbrainsMono`) change.

- [ ] **Step 3: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds. Visually, this alone will not look fully correct yet in a manual check — `Badge`/`TableHead` mono treatment (Task 2) and the header (Task 3) come next — but there must be no build errors, and every existing page should render with the new background/text/accent colors.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: apply the Signal/Terminal palette and swap to Sora/JetBrains Mono"
```

---

## Task 2: Mono treatment on Badge and table headers

**Files:**
- Modify: `components/ui/badge.tsx`
- Modify: `components/ui/table.tsx`

**Interfaces:**
- Consumes: `font-mono` Tailwind utility (Task 1).
- Produces: every existing `<Badge>` and `<TableHead>` usage across the app (admin, audit, import preview, and — after Tasks 4/5 — items/members) now renders in JetBrains Mono with no call-site changes needed anywhere.

- [ ] **Step 1: Add `font-mono` to Badge's base classes**

In `components/ui/badge.tsx`, change:
```ts
export const badgeVariants = cva('inline-flex items-center rounded-md border border-transparent px-2 py-0.5 text-xs font-medium', {
```
to:
```ts
export const badgeVariants = cva('inline-flex items-center rounded-md border border-transparent px-2 py-0.5 text-xs font-medium font-mono uppercase tracking-wide', {
```
(The rest of the file — variants, `defaultVariants`, the `Badge` component itself — is unchanged.)

- [ ] **Step 2: Add `font-mono` to TableHead's base classes**

In `components/ui/table.tsx`, change:
```tsx
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-10 px-4 text-left align-middle font-medium text-muted-foreground', className)} {...props} />
  )
```
to:
```tsx
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-10 px-4 text-left align-middle font-medium font-mono text-xs uppercase tracking-wide text-muted-foreground', className)} {...props} />
  )
```
(Every other export in the file — `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` — is unchanged.)

- [ ] **Step 3: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/ui/badge.tsx components/ui/table.tsx
git commit -m "feat: apply mono treatment to Badge and table column headers"
```

---

## Task 3: Dashboard shell header mono treatment

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `font-mono` Tailwind utility (Task 1).

**Test-sensitive strings:** `getByText('seller@example.com')` (and other seeded emails) in `tests/e2e/auth.spec.ts` must still resolve — text content is unchanged, only styling classes are added.

- [ ] **Step 1: Add mono styling to the app name and user email**

In `app/(dashboard)/layout.tsx`, change:
```tsx
          <Link href="/events" className="font-semibold text-foreground">
            Myyntijärjestelmä
          </Link>
          {session?.user && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{session.user.email}</span>
```
to:
```tsx
          <Link href="/events" className="font-mono text-sm font-semibold uppercase tracking-wide text-foreground">
            Myyntijärjestelmä
          </Link>
          {session?.user && (
            <div className="flex items-center gap-4 text-sm">
              <span className="font-mono text-muted-foreground">{session.user.email}</span>
```
(Everything else in the file — the `logout` form, the `Button`, the `<main>` wrapper — is unchanged.)

- [ ] **Step 2: Run the auth E2E spec**

First check nothing is listening on port 3000 (`netstat -ano | grep ":3000"` — only `TIME_WAIT` is fine).

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test tests/e2e/auth.spec.ts`
Expected: PASS.

- [ ] **Step 3: Revert the stray `tsconfig.json` change and commit**

```bash
git checkout -- tsconfig.json
git add "app/(dashboard)/layout.tsx"
git commit -m "feat: apply mono treatment to the dashboard shell header"
```

---

## Task 4: Items page two-column restructure

**Files:**
- Modify: `app/(dashboard)/events/[eventId]/items/page.tsx`

**Interfaces:**
- Consumes: `AddItemForm`, `AddSeriesForm` (unchanged, not modified by this task), `Badge`, `Button` (Task 2's mono Badge cascades in automatically).

**Test-sensitive strings:** `getByText('Manga Vol. 1')` and similar item-name assertions, `getByRole('button', { name: /delete/i })`, `getByRole('button', { name: /add item/i })`, the `addItemForm` scoping locator (`page.locator('form').filter({ has: page.getByPlaceholder('Item name') })`) used in `items.spec.ts` and `items-quickrepeat.spec.ts` — none of these depend on the surrounding layout markup (list-item vs. grid-row, `<ul>` vs. `<div>`), only on the text/roles/placeholders themselves, which are all preserved below.

- [ ] **Step 1: Restructure `app/(dashboard)/events/[eventId]/items/page.tsx` into two columns**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { listItemsForSeller } from '@/lib/services/items'
import { deleteItem } from '@/actions/items'
import { AddItemForm } from './AddItemForm'
import { AddSeriesForm } from './AddSeriesForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function ItemsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) redirect('/events')

  const [categories, itemsResult] = await Promise.all([
    prisma.category.findMany({ where: { eventId } }),
    listItemsForSeller(session, eventId),
  ])
  const items = itemsResult.ok ? itemsResult.data : []
  const listedIds = items.filter((i) => i.status === 'LISTED').map((i) => i.id)
  const rowCols = 'grid-cols-[2fr_0.6fr_0.8fr_1fr]'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">My items</h1>
        {listedIds.length > 0 && (
          <a
            href={`/api/price-tags/${eventId}?itemIds=${listedIds.join(',')}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Print all price tags
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-1">
          <div className={`grid ${rowCols} gap-3 px-3 pb-2`}>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Item</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Price</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Status</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Actions</span>
          </div>
          {items.map((item) => (
            <div key={item.id} className={`grid ${rowCols} items-center gap-3 rounded-md px-3 py-2.5`}>
              <span className="text-foreground">{item.name}</span>
              <span className="text-foreground">{item.price} €</span>
              <Badge variant={item.status === 'SOLD' ? 'success' : 'secondary'} className="w-fit">
                {item.status}
              </Badge>
              <div className="flex items-center gap-3">
                {item.status === 'LISTED' && (
                  <form
                    action={async () => {
                      'use server'
                      await deleteItem(item.id, eventId)
                    }}
                  >
                    <Button type="submit" variant="destructive" size="sm">
                      Delete
                    </Button>
                  </form>
                )}
                {item.status === 'LISTED' && (
                  <a
                    href={`/api/price-tags/${eventId}?itemIds=${item.id}`}
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Price tag
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-6 lg:border-l lg:border-border lg:pl-8">
          <AddItemForm eventId={eventId} categories={categories} />
          <AddSeriesForm eventId={eventId} categories={categories} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the items E2E specs**

First check nothing is listening on port 3000.

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test tests/e2e/items.spec.ts tests/e2e/items-quickrepeat.spec.ts tests/e2e/items-series.spec.ts`
Expected: all PASS.

- [ ] **Step 3: Revert `tsconfig.json` and commit**

```bash
git checkout -- tsconfig.json
git add "app/(dashboard)/events/[eventId]/items/page.tsx"
git commit -m "feat: restructure items page into Signal's two-column layout"
```

---

## Task 5: Members page two-column restructure

**Files:**
- Modify: `app/(dashboard)/events/[eventId]/members/page.tsx`

**Interfaces:**
- Consumes: `InviteMemberForm` (unchanged, not modified by this task), `Badge` (Task 2).

**Test-sensitive strings:** `getByText('invitedseller@example.com')` in `events.spec.ts` — `getByText` matches any element containing that substring, so splitting the previous combined `{name} ({email}) — {role}` text node into separate grid cells is safe (confirmed against the actual assertion, not assumed).

- [ ] **Step 1: Restructure `app/(dashboard)/events/[eventId]/members/page.tsx` into two columns**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { InviteMemberForm } from './InviteMemberForm'
import { Badge } from '@/components/ui/badge'

export default async function MembersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['ADMIN'])
  if (!authz.ok) redirect('/events')

  const memberships = await prisma.eventMembership.findMany({ where: { eventId }, include: { user: true } })
  const rowCols = 'grid-cols-[1.3fr_1.5fr_0.7fr_0.8fr]'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Members</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-1">
          <div className={`grid ${rowCols} gap-3 px-3 pb-2`}>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Name</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Email</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Role</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Status</span>
          </div>
          {memberships.map((m) => (
            <div key={m.id} className={`grid ${rowCols} items-center gap-3 rounded-md px-3 py-2.5`}>
              <span className="text-foreground">{m.user.name}</span>
              <span className="text-muted-foreground">{m.user.email}</span>
              <span className="text-foreground">{m.role}</span>
              <Badge variant={m.status === 'ACTIVE' ? 'success' : 'destructive'} className="w-fit">
                {m.status}
              </Badge>
            </div>
          ))}
        </div>

        <div className="lg:border-l lg:border-border lg:pl-8">
          <InviteMemberForm eventId={eventId} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the events E2E spec (covers the invite flow)**

First check nothing is listening on port 3000.

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test tests/e2e/events.spec.ts`
Expected: PASS.

- [ ] **Step 3: Revert `tsconfig.json` and commit**

```bash
git checkout -- tsconfig.json
git add "app/(dashboard)/events/[eventId]/members/page.tsx"
git commit -m "feat: restructure members page into Signal's two-column layout"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no errors (the pre-existing unrelated `jsx-a11y/alt-text` warning in `lib/services/price-tags.tsx` is expected and not a regression).

- [ ] **Step 2: Full unit/integration suite**

Run: `NODE_OPTIONS='--require dotenv/config' npm test`
Expected: all tests pass (108 at the time of writing — confirm the actual current count in `git log`/prior test output rather than assuming this number is still exact, since other work may have landed since this plan was written).

- [ ] **Step 3: Full E2E suite**

First check nothing is listening on port 3000.

Run: `NODE_OPTIONS='--require dotenv/config' npm run test:e2e`
Expected: all specs pass.

- [ ] **Step 4: Manual visual/keyboard spot check**

This retheme touches every page via cascading tokens, and the checkout scanner's confirm flow depends on a keyboard-only interaction that's easy to visually verify but not obviously covered by "the E2E test passed" alone:
1. `npm run dev`, log in, visit a live event's `/checkout`.
2. Confirm the new phosphor-green/near-black palette renders correctly (no leftover amber, no unreadable text, the destructive-red "Confirm" states if any are legible against the new background).
3. Without touching the mouse: scan/type a code, Enter, Enter — confirm the sale completes and focus never visibly left the input.
4. Visit `/events/[eventId]/items` and `/events/[eventId]/members` and confirm both render as two columns on a normal desktop-width window, and collapse to a single column on a narrow one (the `lg:` breakpoint).

- [ ] **Step 5: Production build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Final commit (if anything was left uncommitted)**

```bash
git status
```
If clean, no commit needed. If lint/build fixes produced uncommitted changes, stage and commit them with an appropriate message.
