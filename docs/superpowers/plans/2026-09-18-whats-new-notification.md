# "What's New" Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a signed-in user a dismissible banner, once per new release, with the single most recent release note their role is allowed to see — with no new route, no admin UI, and no new DB table beyond one nullable column on `User`.

**Architecture:** Release notes are hand-authored as a bilingual, most-recent-first JSON array in `messages/release-notes.json`. Each entry optionally declares a `minRole`; a user's effective role is the highest `EventRole` across their `ACTIVE` memberships (or `'OWNER'` if `User.isOwner`). `lib/services/release-notes.ts` picks the newest entry that role can see and compares its `date` against `User.lastSeenReleaseNoteDate`; `app/(dashboard)/layout.tsx` renders a small client banner when there's an unseen one, and dismissing it calls a Server Action that persists the date.

**Tech Stack:** Next.js 15 App Router, Prisma migration, `next-intl` (already installed), Vitest (unit/integration), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-09-18-whats-new-notification-design.md`

## Global Constraints

- `actions/*.ts` files never call Prisma directly — all DB access goes through `lib/services/release-notes.ts`, per this repo's `app → actions → services → Prisma` layering (see `CLAUDE.md`).
- Role ranking is `SELLER < STAFF < ADMIN < OWNER`, matching the existing `EventRole` Prisma enum's own declaration order and `lib/services/authz.ts`'s synthetic `'OWNER'` convention (a user with `isOwner: true` always ranks highest, regardless of any memberships).
- Effective role is computed from `ACTIVE` memberships only (`status: 'ACTIVE'`) — matches the existing convention in `lib/services/events.ts`'s `listEventsForUser`. `PENDING`/`REMOVED` memberships never count.
- `User.lastSeenReleaseNoteDate` defaults to `null` (no migration backfill value needed) — `null` means "show them the latest visible entry," which is correct for both existing users (who haven't dismissed anything yet) and brand-new signups (who should also see the latest entry, not nothing).
- Every English message value must be **byte-identical** to what's specified in this plan — no paraphrasing.
- `NODE_OPTIONS='--require dotenv/config'` must prefix every direct `vitest`/`playwright` invocation. Confirm port 3000 has no stray server (`netstat -ano | grep :3000`, only `TIME_WAIT` is fine) before running Playwright. If `next dev`/`playwright test` rewrites `tsconfig.json`, run `git checkout -- tsconfig.json` before committing — never commit that file's auto-rewrite noise.
- The e2e test in Task 2 asserts against the real, seeded content of `messages/release-notes.json` written in Task 1 — by design, per the spec (a committed file, not a mockable data source). Whoever adds the *next* real release note after this plan ships should expect to update that e2e test's expected text, the same way `tests/e2e/locale-phase2.spec.ts` already depends on real translated UI strings.

---

## Task 1: Schema, content file, and the service layer

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_user_last_seen_release_note/migration.sql` (via `npx prisma migrate dev`, not hand-written)
- Create: `messages/release-notes.json`
- Create: `lib/services/release-notes.ts`
- Test: `tests/unit/release-notes.test.ts`
- Test: `tests/integration/release-notes.test.ts`

**Interfaces:**
- Produces: `getEffectiveRole(userId: string): Promise<'SELLER' | 'STAFF' | 'ADMIN' | 'OWNER'>`, `selectVisibleNote(notes: ReleaseNote[], effectiveRole: 'SELLER' | 'STAFF' | 'ADMIN' | 'OWNER', lastSeenDate: string | null): ReleaseNote | null` (pure, exported for direct unit testing), `getLatestVisibleReleaseNote(userId: string): Promise<ReleaseNote | null>`, `markReleaseNoteSeen(userId: string, date: string): Promise<void>`, and the `ReleaseNote` type (`{ date: string; minRole?: 'SELLER' | 'STAFF' | 'ADMIN'; en: string; fi: string }`) — Task 2's action and layout consume all of these.

- [ ] **Step 1: Write the failing unit tests for `selectVisibleNote`**

`tests/unit/release-notes.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { selectVisibleNote, type ReleaseNote } from '@/lib/services/release-notes'

const notes: ReleaseNote[] = [
  { date: '2026-09-18', minRole: 'STAFF', en: 'Staff note', fi: 'Henkilökunnan tiedote' },
  { date: '2026-09-11', en: 'General note', fi: 'Yleinen tiedote' },
]

describe('selectVisibleNote', () => {
  it('returns the newest entry visible to a SELLER when the newest overall is STAFF-only', () => {
    const result = selectVisibleNote(notes, 'SELLER', null)
    expect(result?.date).toBe('2026-09-11')
  })

  it('returns the newest entry (including STAFF-only ones) for a STAFF role', () => {
    const result = selectVisibleNote(notes, 'STAFF', null)
    expect(result?.date).toBe('2026-09-18')
  })

  it('returns null once the visible-latest date matches lastSeenDate', () => {
    const result = selectVisibleNote(notes, 'SELLER', '2026-09-11')
    expect(result).toBeNull()
  })

  it('returns the newer visible entry again if lastSeenDate is an older, already-dismissed one', () => {
    const result = selectVisibleNote(notes, 'STAFF', '2026-09-11')
    expect(result?.date).toBe('2026-09-18')
  })

  it('returns null for an empty notes array', () => {
    expect(selectVisibleNote([], 'ADMIN', null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/release-notes.test.ts`
Expected: FAIL — `@/lib/services/release-notes` does not exist yet.

- [ ] **Step 3: Create the release notes content file**

`messages/release-notes.json` — most-recent-first, so the STAFF-only entry (published today) sits above the older general one:
```json
[
  {
    "date": "2026-09-18",
    "minRole": "STAFF",
    "en": "Staff can now view and print price tags for any seller's items, not just their own.",
    "fi": "Työvoima voi nyt tarkastella ja tulostaa kaikkien myyjien hintalappuja, ei vain omiaan."
  },
  {
    "date": "2026-09-11",
    "en": "The app is now fully available in Finnish — look for the flag button next to your name.",
    "fi": "Sovellus on nyt kokonaan saatavilla suomeksi — etsi lippupainiketta nimesi vierestä."
  }
]
```

- [ ] **Step 4: Implement `selectVisibleNote` and the `ReleaseNote` type**

`lib/services/release-notes.ts` (partial — this step only):
```ts
export type ReleaseNote = { date: string; minRole?: 'SELLER' | 'STAFF' | 'ADMIN'; en: string; fi: string }
type EffectiveRole = 'SELLER' | 'STAFF' | 'ADMIN' | 'OWNER'

const ROLE_RANK: Record<EffectiveRole, number> = { SELLER: 0, STAFF: 1, ADMIN: 2, OWNER: 3 }

export function selectVisibleNote(
  notes: ReleaseNote[],
  effectiveRole: EffectiveRole,
  lastSeenDate: string | null
): ReleaseNote | null {
  const visible = notes.filter((n) => ROLE_RANK[n.minRole ?? 'SELLER'] <= ROLE_RANK[effectiveRole])
  const latest = visible[0] ?? null
  if (latest && latest.date === lastSeenDate) return null
  return latest
}
```

- [ ] **Step 5: Run the unit tests, verify they pass**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/release-notes.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 6: Write the failing integration test for `getEffectiveRole`**

`tests/integration/release-notes.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { getEffectiveRole } from '@/lib/services/release-notes'

describe('getEffectiveRole', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('returns OWNER for a global owner regardless of memberships', async () => {
    const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
    expect(await getEffectiveRole(owner.id)).toBe('OWNER')
  })

  it('returns SELLER for a user with no memberships at all', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Nobody', email: 'nobody@example.com', passwordHash: 'x' } })
    expect(await getEffectiveRole(user.id)).toBe('SELLER')
  })

  it('returns the highest role across multiple ACTIVE memberships', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Multi', email: 'multi@example.com', passwordHash: 'x' } })
    const owner = await testPrisma.user.create({ data: { name: 'Owner2', email: 'owner2@example.com', isOwner: true, passwordHash: 'x' } })
    const event1 = await testPrisma.event.create({
      data: { name: 'E1', eventDate: new Date(Date.now() + 86400000), registrationDeadline: new Date(), itemEditCutoffDate: new Date(), createdByUserId: owner.id },
    })
    const event2 = await testPrisma.event.create({
      data: { name: 'E2', eventDate: new Date(Date.now() + 86400000), registrationDeadline: new Date(), itemEditCutoffDate: new Date(), createdByUserId: owner.id },
    })
    await testPrisma.eventMembership.create({ data: { userId: user.id, eventId: event1.id, role: 'SELLER', status: 'ACTIVE' } })
    await testPrisma.eventMembership.create({ data: { userId: user.id, eventId: event2.id, role: 'STAFF', status: 'ACTIVE' } })
    expect(await getEffectiveRole(user.id)).toBe('STAFF')
  })

  it('ignores REMOVED memberships when computing the highest role', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Removed', email: 'removed@example.com', passwordHash: 'x' } })
    const owner = await testPrisma.user.create({ data: { name: 'Owner3', email: 'owner3@example.com', isOwner: true, passwordHash: 'x' } })
    const event = await testPrisma.event.create({
      data: { name: 'E3', eventDate: new Date(Date.now() + 86400000), registrationDeadline: new Date(), itemEditCutoffDate: new Date(), createdByUserId: owner.id },
    })
    await testPrisma.eventMembership.create({ data: { userId: user.id, eventId: event.id, role: 'ADMIN', status: 'REMOVED' } })
    expect(await getEffectiveRole(user.id)).toBe('SELLER')
  })
})

describe('getLatestVisibleReleaseNote and markReleaseNoteSeen', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('returns the real seeded latest visible entry for a fresh (SELLER-effective) user, then null after marking it seen', async () => {
    const { getLatestVisibleReleaseNote, markReleaseNoteSeen } = await import('@/lib/services/release-notes')
    const user = await testPrisma.user.create({ data: { name: 'Fresh', email: 'fresh@example.com', passwordHash: 'x' } })

    // The newest entry in messages/release-notes.json is STAFF-only, so a
    // plain SELLER's latest *visible* entry is the older, general one.
    const first = await getLatestVisibleReleaseNote(user.id)
    expect(first?.date).toBe('2026-09-11')

    await markReleaseNoteSeen(user.id, first!.date)
    const second = await getLatestVisibleReleaseNote(user.id)
    expect(second).toBeNull()
  })
})
```

- [ ] **Step 7: Run it, verify it fails**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/integration/release-notes.test.ts`
Expected: FAIL — `getEffectiveRole`, `getLatestVisibleReleaseNote`, `markReleaseNoteSeen` are not exported yet (and the `User` model has no `lastSeenReleaseNoteDate` column).

- [ ] **Step 8: Add the schema column and migrate**

Add to `prisma/schema.prisma`'s `User` model, directly below the existing `locale String @default("en")` line:
```prisma
lastSeenReleaseNoteDate String?
```

Run: `npx prisma migrate dev --name add_user_last_seen_release_note`
Expected: creates `prisma/migrations/<timestamp>_add_user_last_seen_release_note/migration.sql` and applies it to `DATABASE_URL`.

Apply the same migration to the test database:

Run: `DATABASE_URL="<value of DATABASE_URL_TEST from .env>" npx prisma migrate deploy`

- [ ] **Step 9: Implement `getEffectiveRole`, `getLatestVisibleReleaseNote`, `markReleaseNoteSeen`**

Append to `lib/services/release-notes.ts` (after the Step 4 content):
```ts
import { prisma } from '@/lib/db'

export async function getEffectiveRole(userId: string): Promise<EffectiveRole> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isOwner: true } })
  if (user.isOwner) return 'OWNER'

  const memberships = await prisma.eventMembership.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { role: true },
  })
  return memberships.reduce<EffectiveRole>(
    (highest, m) => (ROLE_RANK[m.role] > ROLE_RANK[highest] ? m.role : highest),
    'SELLER'
  )
}

export async function getLatestVisibleReleaseNote(userId: string): Promise<ReleaseNote | null> {
  const notes: ReleaseNote[] = (await import('@/messages/release-notes.json')).default as ReleaseNote[]
  const effectiveRole = await getEffectiveRole(userId)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { lastSeenReleaseNoteDate: true } })
  return selectVisibleNote(notes, effectiveRole, user.lastSeenReleaseNoteDate)
}

export async function markReleaseNoteSeen(userId: string, date: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastSeenReleaseNoteDate: date } })
}
```

Move the `import { prisma } from '@/lib/db'` line to the top of the file with the other imports (shown here appended for clarity of what's new).

- [ ] **Step 10: Run both test files, verify everything passes**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/release-notes.test.ts tests/integration/release-notes.test.ts`
Expected: PASS, all 10 tests (5 unit + 5 integration).

- [ ] **Step 11: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all tests pass (138 existing + 10 new = 148).

- [ ] **Step 12: Commit**

```bash
git checkout -- tsconfig.json
git add prisma/schema.prisma prisma/migrations messages/release-notes.json lib/services/release-notes.ts tests/unit/release-notes.test.ts tests/integration/release-notes.test.ts
git commit -m "feat: add the release-notes schema, content file, and service layer"
```

---

## Task 2: Server action, banner UI, layout wiring, and e2e coverage

**Files:**
- Create: `actions/release-notes.ts`
- Create: `components/ReleaseNoteBanner.tsx`
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `messages/en.json`, `messages/fi.json`
- Test: `tests/e2e/whats-new.spec.ts`
- Modify: `docs/next-steps.md`

**Interfaces:**
- Consumes: `getLatestVisibleReleaseNote`, `markReleaseNoteSeen`, `ReleaseNote` from `@/lib/services/release-notes` (Task 1).
- Produces: `dismissReleaseNote(date: string): Promise<void>` Server Action; `<ReleaseNoteBanner date={string} text={string} />` client component.

- [ ] **Step 1: Add the dismiss-button message strings**

Add to `messages/en.json`, as a new sibling namespace (do not touch any existing namespace):
```json
"ReleaseNoteBanner": {
  "dismiss": "Dismiss"
}
```

Add to `messages/fi.json`:
```json
"ReleaseNoteBanner": {
  "dismiss": "Hylkää"
}
```

- [ ] **Step 2: Create the Server Action**

`actions/release-notes.ts`:
```ts
'use server'

import { auth } from '@/lib/auth'
import { markReleaseNoteSeen } from '@/lib/services/release-notes'

export async function dismissReleaseNote(date: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return
  await markReleaseNoteSeen(session.user.id, date)
}
```

- [ ] **Step 3: Create the banner component**

`components/ReleaseNoteBanner.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { dismissReleaseNote } from '@/actions/release-notes'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function ReleaseNoteBanner({ date, text }: { date: string; text: string }) {
  const t = useTranslations('ReleaseNoteBanner')
  const [dismissed, setDismissed] = useState(false)
  const [pending, startTransition] = useTransition()

  if (dismissed) return null

  function handleDismiss() {
    setDismissed(true)
    startTransition(async () => {
      await dismissReleaseNote(date)
    })
  }

  return (
    <Alert className="mb-4">
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{text}</span>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleDismiss}>
          {t('dismiss')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
```

- [ ] **Step 4: Wire it into the dashboard layout**

Modify `app/(dashboard)/layout.tsx`. Full replacement:
```tsx
import type { ReactNode } from 'react'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { logout } from '@/actions/auth'
import { getLatestVisibleReleaseNote } from '@/lib/services/release-notes'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/BackButton'
import { LocaleToggle } from '@/components/LocaleToggle'
import { ReleaseNoteBanner } from '@/components/ReleaseNoteBanner'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const t = await getTranslations('DashboardLayout')
  const locale = await getLocale()
  const note = session?.user?.id ? await getLatestVisibleReleaseNote(session.user.id) : null

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3">
          <div className="flex items-center gap-2">
            {session?.user && <BackButton />}
            <Link href="/events" className="font-mono text-sm font-semibold uppercase tracking-wide text-foreground">
              Myyntijärjestelmä
            </Link>
          </div>
          <div className="flex min-w-0 items-center gap-4 text-sm">
            <LocaleToggle />
            {session?.user && (
              <>
                <span className="min-w-0 truncate font-mono text-muted-foreground">{session.user.email}</span>
                <form action={logout}>
                  <Button type="submit" variant="outline" size="sm">
                    {t('signOut')}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        {note && <ReleaseNoteBanner date={note.date} text={locale === 'fi' ? note.fi : note.en} />}
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Write the failing e2e test**

`tests/e2e/whats-new.spec.ts`:
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

test('a fresh user sees the latest visible release note and can dismiss it', async ({ page }) => {
  await testPrisma.user.create({
    data: { name: 'Seller', email: 'seller-whatsnew@example.com', passwordHash: await hashPassword('seller-whatsnew-pw1') },
  })

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('seller-whatsnew@example.com')
  await page.getByLabel('Password', { exact: true }).fill('seller-whatsnew-pw1')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  // The newest entry (STAFF-only) is filtered out for a plain SELLER, so
  // the older, general entry is their "latest visible" one.
  await expect(page.getByText('The app is now fully available in Finnish — look for the flag button next to your name.')).toBeVisible()
  await expect(page.getByText('Staff can now view and print price tags')).not.toBeVisible()

  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('The app is now fully available in Finnish')).not.toBeVisible()

  await page.reload()
  await expect(page.getByText('The app is now fully available in Finnish')).not.toBeVisible()
})

test('a STAFF member sees the STAFF-only note that a plain SELLER (Test 1, above) would not', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner-whatsnew@example.com', isOwner: true, passwordHash: await hashPassword('owner-whatsnew-pw1') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff-whatsnew@example.com', passwordHash: await hashPassword('staff-whatsnew-pw1') },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('staff-whatsnew@example.com')
  await page.getByLabel('Password', { exact: true }).fill('staff-whatsnew-pw1')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  // The STAFF-only entry (2026-09-18) is the newest entry in the file at
  // all, so it's this user's "latest visible" one straight away — no prior
  // dismissal needed to demonstrate the role gate.
  await expect(page.getByText('Staff can now view and print price tags')).toBeVisible()
})
```

- [ ] **Step 7: Run it, verify it fails for the expected reason**

Confirm port 3000 is clear: `netstat -ano | grep :3000` (only `TIME_WAIT` is fine).

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test tests/e2e/whats-new.spec.ts`
Expected: FAIL before Steps 1-4 exist. Since this task's plan already has you implementing UI in Steps 1-4 before writing this test, this step instead serves as your first real run — expect PASS if Steps 1-4 were done correctly. If it fails, treat any failure here as real (not "expected") and debug per `superpowers:systematic-debugging` before moving on. If it fails with a `net::ERR_ABORTED`/timeout on a first-hit route, add `await page.waitForLoadState('networkidle')` after the affected `page.goto`, matching this repo's documented dev-mode Fast-Refresh gotcha (see `CLAUDE.md`), and retry once before treating it as a real bug.

- [ ] **Step 8: Run the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all 148 tests pass.

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test`
Expected: all tests pass except any already-documented pre-existing flake in `events.spec.ts` (`net::ERR_ABORTED` dev-mode compile-race, tracked in `docs/next-steps.md`) — retry that one specifically once before treating it as a regression.

- [ ] **Step 9: Update `docs/next-steps.md`**

Replace item 2 in the `## Open` section:
```markdown
2. **No in-app notification when new changes are published** — DONE
   - Shipped: a dismissible banner in the dashboard layout (`app/(dashboard)/layout.tsx`), showing the single most recent release note a user's effective role can see. Notes are hand-authored in `messages/release-notes.json` (bilingual, most-recent-first, optional `minRole`); a user's effective role is the highest `EventRole` across their `ACTIVE` memberships (or `OWNER` if `isOwner`). Dismissing persists `User.lastSeenReleaseNoteDate`. See `docs/superpowers/specs/2026-09-18-whats-new-notification-design.md`.
   - To announce a future change: add a new entry to the top of `messages/release-notes.json` (both `en` and `fi`) as part of that change's own PR. No admin UI, no separate release process.
```

- [ ] **Step 10: Commit**

```bash
git checkout -- tsconfig.json
git add actions/release-notes.ts components/ReleaseNoteBanner.tsx "app/(dashboard)/layout.tsx" messages/en.json messages/fi.json tests/e2e/whats-new.spec.ts docs/next-steps.md
git commit -m "feat: add the what's-new notification banner"
```
