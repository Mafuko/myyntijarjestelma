# Server-Side Error/Validation Message Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every server-side error and validation message a user can see is translated (EN/FI), by giving every error a stable, distinct `code` and translating client-side by that code — closing the last open item of the language-switching effort.

**Architecture:** `Result<T>`'s error shape widens from `{ code, message }` to `{ code, message, params? }`. Every literal English service/action message keeps its exact wording in `message` (an English fallback/log string — `lib/services` and `actions` never see a locale) while `code` becomes the real differentiator, resolved to translated text client-side via a new `ServiceErrors` `next-intl` namespace. Every Zod schema field gets an explicit `message` parameter (Zod's own supported customization option) whose payload is a code string instead of prose — for these specifically, `code` and `message` end up holding the same code value (documented, deliberate: a parallel English-prose fallback table would just duplicate `messages/en.json`). Two messages carry interpolated data via the new `params` field. 13 UI components switch from rendering a raw string to storing the whole error object and rendering `tErrors(error.code, error.params)`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Zod 4.4.3 (already installed — verified exact message-customization syntax against the real package before writing this plan, see Task 2), `next-intl` (already installed), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-i18n-error-messages-design.md`

## Global Constraints

- `lib/services/*.ts` and `actions/*.ts` never import anything from `next-intl` or read a locale — translation happens only in `app/**`/`components/**` client components, matching the precedent from i18n Phase 3.
- Every literal English `message` string that exists today (the ~27 service/action-layer literals) keeps its **exact current wording**, byte-identical — only `code` values change (and only where a collision required a new, more specific code — see the Collision Table below). This is a translation pass, not a copywriting pass.
- Zod-derived errors are the one deliberate exception to "message stays prose": once a schema field's `message` parameter is repointed at a code string, `error.message` for that specific error becomes that code value too (not prose) — this is documented in Task 2, not an oversight.
- `next-intl`'s `t()` accepts a runtime-dynamic string key with no special typing needed — this project has no `IntlMessages`/strict-typed-messages augmentation (confirmed: `ItemRow.tsx`'s existing `tStatus(item.status as 'LISTED' | 'SOLD')` already proves dynamic-key lookups work in this exact next-intl setup).
- `Result<T>` stays duplicated as a local type alias per file (14 occurrences today) rather than being centralized into a new shared module — matches this codebase's existing, deliberate convention (confirmed identical byte-for-byte across all 14 current occurrences); do not introduce a new shared types file as part of this plan.
- `NODE_OPTIONS='--require dotenv/config'` must prefix every direct `vitest`/`playwright` invocation. Confirm port 3000 has no stray server before running Playwright. If `next dev`/`playwright test`/`next build` rewrites `tsconfig.json`, run `git checkout -- tsconfig.json` before committing — never commit that file's auto-rewrite noise.
- `lib/services/price-tags.tsx`'s thrown `Error('Failed to generate a unique barcode after 5 attempts')` is explicitly OUT OF SCOPE — it's a genuine-bug throw per this repo's own `Result<T>` convention (throwing is for infra failures, not user-facing validation), never surfaced as a normal `Result` error.

## Collision Table (codes that could NOT simply keep their existing name)

Several existing codes are reused today for **different** messages within the same file or across files — a code-based lookup can't distinguish them, so these needed a new, more specific name. Every other existing code (`ALREADY_SOLD`, `NOT_SOLD`, `CUTOFF_PASSED`, `NO_ITEMS`, `FILE_TOO_LARGE`, `EMPTY_FILE`, `TOO_MANY_ROWS`, `NO_ROWS`, `ALREADY_MEMBER`, `INVALID_TOKEN`, `ALREADY_INITIALIZED`, `INVALID_CREDENTIALS`, `UNAUTHENTICATED`) keeps its current name unchanged.

| Old code | Old message(s) | New code | File(s) |
|---|---|---|---|
| `FORBIDDEN` | "You do not have access to this event" | `FORBIDDEN_EVENT_ACCESS` | `lib/services/authz.ts` (`requireEventAccess`) |
| `FORBIDDEN` | "Only the site owner can perform this action" | `FORBIDDEN_OWNER_ONLY` | `lib/services/authz.ts` (`requireOwner`) |
| `FORBIDDEN` | "You cannot modify this item" | `FORBIDDEN_NOT_ITEM_OWNER` | `lib/services/items.ts` |
| `FORBIDDEN` | "You can only generate tags for your own items" | `FORBIDDEN_NOT_PRICE_TAG_OWNER` | `lib/services/price-tags.tsx` |
| `NOT_FOUND` | "Code not recognized" | `CODE_NOT_FOUND` | `lib/services/sales.ts` (`lookupItemByCode`) |
| `NOT_FOUND` | "Item not found" | `ITEM_NOT_FOUND` | `lib/services/sales.ts` (`recordSale`, `undoSale`), `lib/services/items.ts` (`assertOwnsItemOrIsManager`) |
| `RATE_LIMITED` | "Too many lookups — please slow down" | `RATE_LIMITED_LOOKUP` | `lib/services/sales.ts` |
| `RATE_LIMITED` | "Too many login attempts. Please try again in a minute." | `RATE_LIMITED_LOGIN` | `actions/auth.ts` |
| `UNEXPECTED_ERROR` (×3, all different messages) | 3 distinct "Something went wrong..." strings | `LOOKUP_UNEXPECTED_ERROR`, `RECORD_SALE_UNEXPECTED_ERROR`, `UNDO_SALE_UNEXPECTED_ERROR` | `actions/sales.ts` |
| `VALIDATION_ERROR` (blanket, all Zod passthrough sites) | varies | replaced entirely by per-field Zod codes — see Task 2 | 7 call sites across `lib/services/*.ts` + `actions/auth.ts` |

**Existing test impact of this table** (found by searching `tests/` for every affected code before writing this plan, not guessed):
- `tests/integration/authz.test.ts:80` — asserts `'FORBIDDEN'` on `requireEventAccess`'s denial path → update to `'FORBIDDEN_EVENT_ACCESS'`.
- `tests/integration/sales.test.ts:57` — asserts `'NOT_FOUND'` on `lookupItemByCode` → update to `'CODE_NOT_FOUND'`.
- `tests/integration/sales.test.ts:169` — asserts `'NOT_FOUND'` on `undoSale` → update to `'ITEM_NOT_FOUND'`.
- `tests/unit/actions/auth.test.ts:32` — asserts `'VALIDATION_ERROR'` on an invalid-email login attempt → update to `'INVALID_EMAIL'`.
- `tests/unit/actions/auth.test.ts:123` — asserts `'RATE_LIMITED'` → update to `'RATE_LIMITED_LOGIN'`.
- `tests/integration/users.test.ts:212` — asserts `'VALIDATION_ERROR'` on a too-short signup password → update to `'PASSWORD_TOO_SHORT'`.
- `tests/integration/items.test.ts:275` — asserts `'VALIDATION_ERROR'` on `endVolume < startVolume` → update to `'BATCH_END_BEFORE_START'`.
- `tests/integration/items.test.ts:288` — asserts `'VALIDATION_ERROR'` on a >50-volume batch → update to `'BATCH_TOO_MANY_VOLUMES'`.
- Checked and confirmed **unaffected**: `tests/unit/actions/sales.test.ts:48,78` assert on the literal English *message* text for the two `UNEXPECTED_ERROR` cases — that text doesn't change (only `code` does, which these tests don't assert on), so no edit needed there. `tests/unit/imports-parse.test.ts` only asserts `FILE_TOO_LARGE`/`TOO_MANY_ROWS` codes, both unchanged. No e2e test asserts on any of the affected literal English text on-screen (checked: the only matching hit, `checkout.spec.ts:88`'s `"Already sold: Already Sold"`, comes from an unrelated existing translated string, not a service error).

---

## Task 1: `Result<T>`/`RowError`/`ImportFormState` type widening, `authz.ts` codes, `ServiceErrors` namespace seed

**Files:**
- Modify (mechanical `params?` addition to the local `Result<T>` alias, identical edit in all 14): `lib/services/events.ts`, `lib/services/items.ts`, `lib/services/imports.ts`, `lib/services/users.ts`, `lib/services/sales.ts`, `lib/services/sales-dashboard.ts`, `lib/services/profile.ts`, `lib/services/price-tags.tsx`, `actions/items.ts`, `actions/events.ts`, `actions/auth.ts`, `actions/profile.ts`, `actions/users.ts`, `actions/sales.ts`
- Modify: `lib/services/authz.ts` (3 message codes, collision-resolved)
- Modify: `lib/services/imports.ts` (`RowError` type widening — code only, the message conversion itself is Task 3)
- Modify: `actions/imports.ts` (`ImportFormState`'s `'error'` variant widening — code only, conversion is Task 4)
- Modify: `messages/en.json`, `messages/fi.json` (seed `ServiceErrors` namespace with this task's 3 codes)
- Test: `tests/integration/authz.test.ts` (1 assertion update per the Collision Table)

**Interfaces:**
- Produces: the widened `Result<T>` error shape `{ code: string; message: string; params?: Record<string, string | number> }` that every later task's code relies on; the widened `RowError = { row: number; field: string; code: string; params?: Record<string, string | number> }`; the widened `ImportFormState`'s error variant `{ status: 'error'; code: string; params?: Record<string, string | number> }`.
- Consumes: nothing from later tasks.

- [ ] **Step 1: Widen the `Result<T>` type alias in all 14 files**

In each of the 14 files listed above, find the exact line:
```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
```
and replace it with:
```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; params?: Record<string, string | number> } }
```
This line is byte-identical across all 14 files today (verified directly before writing this plan) — the edit is the same in every file.

- [ ] **Step 2: Resolve `authz.ts`'s FORBIDDEN collision**

Full replacement of `lib/services/authz.ts`:
```ts
import { prisma } from '@/lib/db'

export type Role = 'SELLER' | 'STAFF' | 'ADMIN'

export type AuthzResult =
  | { ok: true; userId: string; role: Role | 'OWNER' }
  | { ok: false; error: { code: 'UNAUTHENTICATED' | 'FORBIDDEN_EVENT_ACCESS' | 'FORBIDDEN_OWNER_ONLY'; message: string } }

type MinimalSession = { user?: { id?: string | null } | null } | null

async function getUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } })
}

export async function requireEventAccess(
  session: MinimalSession,
  eventId: string,
  allowedRoles: Role[]
): Promise<AuthzResult> {
  const userId = session?.user?.id
  if (!userId) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }
  }

  const user = await getUser(userId)
  if (user?.isOwner) {
    return { ok: true, userId, role: 'OWNER' }
  }

  const membership = await prisma.eventMembership.findUnique({
    where: { userId_eventId: { userId, eventId } },
  })
  if (!membership || membership.status !== 'ACTIVE' || !allowedRoles.includes(membership.role)) {
    return { ok: false, error: { code: 'FORBIDDEN_EVENT_ACCESS', message: 'You do not have access to this event' } }
  }

  return { ok: true, userId, role: membership.role }
}

export async function requireOwner(session: MinimalSession): Promise<AuthzResult> {
  const userId = session?.user?.id
  if (!userId) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }
  }
  const user = await getUser(userId)
  if (!user?.isOwner) {
    return { ok: false, error: { code: 'FORBIDDEN_OWNER_ONLY', message: 'Only the site owner can perform this action' } }
  }
  return { ok: true, userId, role: 'OWNER' }
}
```
(Note: `AuthzResult`'s error type is narrower than `Result<T>`'s — `{code, message}` with no `params`. This remains structurally assignable everywhere an `AuthzResult` error is returned as part of a `Result<T>`-typed function, since `params` on the target type is optional. No further change needed for this file to interoperate with Task 1's Step 1 widening.)

- [ ] **Step 2b: Update the one existing test affected by this rename**

In `tests/integration/authz.test.ts`, change:
```ts
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN')
```
(the test at line 80, `'denies a non-matching role'`, calling `requireEventAccess`) to:
```ts
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN_EVENT_ACCESS')
```

- [ ] **Step 3: Widen `RowError` in `lib/services/imports.ts`**

Change:
```ts
export type RowError = { row: number; field: string; message: string }
```
to:
```ts
export type RowError = { row: number; field: string; message?: string; code?: string; params?: Record<string, string | number> }
```
(**Additive, not a replacement** — `message` becomes optional rather than being removed, exactly matching `Result<T>`'s own already-additive pattern from Step 1. This is deliberate: `RowError`'s two push sites in this same file still construct `{ ..., message: ... }` today, and `app/(dashboard)/events/[eventId]/items/import/ImportForm.tsx` still reads `e.message` today — neither is in this task's file list, and a required-field replacement here would break both until Tasks 3 and 6 land, leaving `tsc --noEmit` red for the tasks in between. Making all three fields optional keeps every existing reader and writer compiling unchanged through Task 1 alone; Task 3 later sets `code`/`params` and simply stops setting `message` — no type error, since `message` is optional. Task 6's own step below has been written with the corresponding `!` non-null assertions for this reason — do not remove them.)

- [ ] **Step 4: Widen `ImportFormState`'s error variant in `actions/imports.ts`**

Change:
```ts
export type ImportFormState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'preview'; validCount: number; rowErrors: RowError[] }
  | { status: 'committed'; createdCount: number }
```
to:
```ts
export type ImportFormState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; code?: string; params?: Record<string, string | number> }
  | { status: 'preview'; validCount: number; rowErrors: RowError[] }
  | { status: 'committed'; createdCount: number }
```
(Same additive reasoning as `RowError` above. Task 4 updates this file's 5 call sites — not 4 as originally miscounted; they are: the missing/empty file check, the invalid `intent` check, `parseImportFile`'s failure branch, `validateImportRows`'s failure branch, and `commitImport`'s failure branch — that currently construct `{ status: 'error', message: ... }`, switching each to `{ status: 'error', code: ..., params: ... }` and simply omitting `message`, which is valid once this field is optional.)

- [ ] **Step 5: Seed the `ServiceErrors` namespace**

Add to `messages/en.json`, as a new sibling namespace (do not touch any existing namespace):
```json
"ServiceErrors": {
  "UNAUTHENTICATED": "Not signed in",
  "FORBIDDEN_EVENT_ACCESS": "You do not have access to this event",
  "FORBIDDEN_OWNER_ONLY": "Only the site owner can perform this action"
}
```

Add to `messages/fi.json`:
```json
"ServiceErrors": {
  "UNAUTHENTICATED": "Ei kirjautunut sisään",
  "FORBIDDEN_EVENT_ACCESS": "Sinulla ei ole pääsyä tähän tapahtumaan",
  "FORBIDDEN_OWNER_ONLY": "Vain sivuston omistaja voi tehdä tämän"
}
```
(Later tasks append more keys to this same namespace — never restructure or remove what's already there.)

- [ ] **Step 6: Typecheck and run the affected tests**

Run: `npx tsc --noEmit`
Expected: no errors (widening `params?` as optional cannot break any existing call site; the `AuthzResult` code rename is the only breaking type change, and Step 2b's test update covers its only usage).

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/integration/authz.test.ts`
Expected: PASS, all tests including the updated assertion.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all other tests still pass unchanged (no other test currently asserts `'FORBIDDEN'` — confirmed by the Collision Table's search before writing this plan).

- [ ] **Step 7: Commit**

```bash
git checkout -- tsconfig.json
git add lib/services/events.ts lib/services/items.ts lib/services/imports.ts lib/services/users.ts lib/services/sales.ts lib/services/sales-dashboard.ts lib/services/profile.ts lib/services/price-tags.tsx actions/items.ts actions/events.ts actions/auth.ts actions/profile.ts actions/users.ts actions/sales.ts actions/imports.ts lib/services/authz.ts messages/en.json messages/fi.json tests/integration/authz.test.ts
git commit -m "feat: widen Result<T>/RowError/ImportFormState with params, resolve authz's FORBIDDEN collision"
```

---

## Task 2: Zod validation schemas — every field gets a distinct, translatable code

**Files:**
- Modify: `lib/validation/user.ts`, `lib/validation/item.ts`, `lib/validation/event.ts`
- Modify: `messages/en.json`, `messages/fi.json` (append every Zod-derived code)
- Test: `tests/unit/actions/auth.test.ts`, `tests/integration/users.test.ts`, `tests/integration/items.test.ts` (assertion updates per the Collision Table)

**Interfaces:**
- Produces: every Zod schema field now has an explicit `message` parameter carrying a code string (verified working syntax below, confirmed against the actual installed `zod@4.4.3` package before writing this plan — do not deviate from these exact forms).
- Consumes: nothing from Task 1 directly (these files don't touch `Result<T>` themselves — the services that call `.safeParse()` on them already pass `parsed.error.issues[0].message` through unchanged; that message is now a code instead of prose, which is what makes the whole mechanism work).

**Verified Zod syntax** (each form below was actually run against `zod@4.4.3` in this repo before writing this plan — all confirmed working):
- `z.string().min(N, 'CODE')` / `.max(N, 'CODE')` / `.positive('CODE')` — positional string, already used in this codebase today (e.g. `acceptInviteSchema.password`).
- `z.string().email('CODE')` — positional string works.
- `z.enum([...], 'CODE')` — positional string works.
- `z.coerce.number('CODE')`, `z.coerce.date('CODE')` — positional string works for the base coercion-failure message.
- `.refine(fn, { message: 'CODE', path: [...] })` — object form, already used in this codebase today.

- [ ] **Step 1: Full replacement of `lib/validation/user.ts`**

```ts
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('INVALID_EMAIL'),
  password: z.string().min(1, 'PASSWORD_REQUIRED'),
})

export const inviteUserSchema = z
  .object({
    name: z.string().min(1, 'NAME_REQUIRED').max(100, 'NAME_TOO_LONG'),
    email: z.string().trim().toLowerCase().email('INVALID_EMAIL'),
    role: z.enum(['SELLER', 'STAFF', 'ADMIN'], 'INVALID_ROLE'),
    eventId: z.string().min(1, 'EVENT_ID_REQUIRED'),
    sellerAlias: z.string().min(1, 'SELLER_ALIAS_REQUIRED').max(50, 'SELLER_ALIAS_TOO_LONG').optional(),
  })
  .refine((data) => data.role !== 'SELLER' || !!data.sellerAlias, {
    message: 'SELLER_ALIAS_REQUIRED_FOR_ROLE',
    path: ['sellerAlias'],
  })

export const acceptInviteSchema = z.object({
  token: z.string().min(1, 'TOKEN_REQUIRED'),
  password: z.string().min(10, 'PASSWORD_TOO_SHORT'),
})

export const signupSchema = z.object({
  name: z.string().min(1, 'NAME_REQUIRED').max(100, 'NAME_TOO_LONG'),
  email: z.string().trim().toLowerCase().email('INVALID_EMAIL'),
  password: z.string().min(10, 'PASSWORD_TOO_SHORT'),
})

export function isValidIban(iban: string): boolean {
  const normalized = iban.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(normalized)) return false

  const rearranged = normalized.slice(4) + normalized.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55))

  let remainder = 0
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97
  }
  return remainder === 1
}

export const payoutInfoSchema = z
  .object({
    payoutMethod: z.enum(['CASH', 'BANK_TRANSFER'], 'INVALID_PAYOUT_METHOD'),
    iban: z.string().optional(),
  })
  .refine((data) => data.payoutMethod !== 'BANK_TRANSFER' || (!!data.iban && isValidIban(data.iban)), {
    message: 'IBAN_REQUIRED',
    path: ['iban'],
  })
```

- [ ] **Step 2: Full replacement of `lib/validation/item.ts`**

```ts
import { z } from 'zod'

export const createItemSchema = z.object({
  name: z.string().min(1, 'ITEM_NAME_REQUIRED').max(200, 'ITEM_NAME_TOO_LONG'),
  price: z.coerce.number('PRICE_INVALID').positive('PRICE_MUST_BE_POSITIVE').max(100000, 'PRICE_TOO_HIGH'),
  categoryId: z.string().min(1, 'CATEGORY_REQUIRED'),
  isAgeRestricted: z.coerce.boolean().optional().default(false),
})

export const updateItemSchema = createItemSchema.partial()

export const createItemBatchSchema = z
  .object({
    baseName: z.string().min(1, 'BATCH_BASE_NAME_REQUIRED').max(180, 'BATCH_BASE_NAME_TOO_LONG'),
    startVolume: z.coerce.number('BATCH_START_VOLUME_INVALID').int('BATCH_START_VOLUME_INVALID').positive('BATCH_START_VOLUME_MUST_BE_POSITIVE'),
    endVolume: z.coerce.number('BATCH_END_VOLUME_INVALID').int('BATCH_END_VOLUME_INVALID').positive('BATCH_END_VOLUME_MUST_BE_POSITIVE'),
    price: z.coerce.number('PRICE_INVALID').positive('PRICE_MUST_BE_POSITIVE').max(100000, 'PRICE_TOO_HIGH'),
    categoryId: z.string().min(1, 'CATEGORY_REQUIRED'),
    isAgeRestricted: z.coerce.boolean().optional().default(false),
    mode: z.enum(['series', 'bundle'], 'INVALID_MODE'),
  })
  .refine((data) => data.endVolume >= data.startVolume, {
    message: 'BATCH_END_BEFORE_START',
    path: ['endVolume'],
  })
  .refine((data) => data.endVolume - data.startVolume + 1 <= 50, {
    message: 'BATCH_TOO_MANY_VOLUMES',
    path: ['endVolume'],
  })
```
(`price`/`categoryId` deliberately reuse `PRICE_INVALID`/`PRICE_MUST_BE_POSITIVE`/`PRICE_TOO_HIGH`/`CATEGORY_REQUIRED` across both schemas — same field meaning, same translated text, avoiding duplicate `ServiceErrors` keys for an identical concept. `updateItemSchema` inherits `createItemSchema`'s messages automatically via `.partial()` — no separate codes needed.)

- [ ] **Step 3: Full replacement of `lib/validation/event.ts`**

```ts
import { z } from 'zod'

const eventFields = z.object({
  name: z.string().min(1, 'EVENT_NAME_REQUIRED').max(200, 'EVENT_NAME_TOO_LONG'),
  eventDate: z.coerce.date('EVENT_DATE_INVALID'),
  eventEndDate: z.coerce.date('EVENT_END_DATE_INVALID').optional(),
  registrationDeadline: z.coerce.date('REGISTRATION_DEADLINE_INVALID'),
  itemEditCutoffDate: z.coerce.date('ITEM_EDIT_CUTOFF_INVALID'),
  commissionRate: z.coerce.number('COMMISSION_RATE_INVALID').min(0, 'COMMISSION_RATE_TOO_LOW').max(1, 'COMMISSION_RATE_TOO_HIGH').optional().default(0.1),
})

const endDateNotBeforeStart = (data: { eventDate?: Date; eventEndDate?: Date }) =>
  !data.eventEndDate || !data.eventDate || data.eventEndDate >= data.eventDate

export const createEventSchema = eventFields.refine(endDateNotBeforeStart, {
  message: 'EVENT_END_DATE_BEFORE_START',
  path: ['eventEndDate'],
})

export const updateEventSchema = eventFields.partial().refine(endDateNotBeforeStart, {
  message: 'EVENT_END_DATE_BEFORE_START',
  path: ['eventEndDate'],
})
```

- [ ] **Step 4: Append every Zod-derived code to `messages/en.json`'s `ServiceErrors` namespace**

Add these keys inside the existing `"ServiceErrors": { ... }` object from Task 1 (do not create a second `ServiceErrors` key — append as additional properties of the same object):
```json
  "INVALID_EMAIL": "Invalid email",
  "PASSWORD_REQUIRED": "Password is required",
  "NAME_REQUIRED": "Name is required",
  "NAME_TOO_LONG": "Name must be 100 characters or fewer",
  "INVALID_ROLE": "Invalid role",
  "EVENT_ID_REQUIRED": "Event is required",
  "SELLER_ALIAS_REQUIRED": "Seller alias is required",
  "SELLER_ALIAS_TOO_LONG": "Seller alias must be 50 characters or fewer",
  "SELLER_ALIAS_REQUIRED_FOR_ROLE": "sellerAlias is required for the SELLER role",
  "TOKEN_REQUIRED": "Token is required",
  "PASSWORD_TOO_SHORT": "Password must be at least 10 characters",
  "INVALID_PAYOUT_METHOD": "Invalid payout method",
  "IBAN_REQUIRED": "A valid IBAN is required for bank transfer payout",
  "ITEM_NAME_REQUIRED": "Item name is required",
  "ITEM_NAME_TOO_LONG": "Item name must be 200 characters or fewer",
  "PRICE_INVALID": "Enter a valid price",
  "PRICE_MUST_BE_POSITIVE": "Price must be greater than zero",
  "PRICE_TOO_HIGH": "Price must be 100,000 or less",
  "CATEGORY_REQUIRED": "Category is required",
  "BATCH_BASE_NAME_REQUIRED": "Base name is required",
  "BATCH_BASE_NAME_TOO_LONG": "Base name must be 180 characters or fewer",
  "BATCH_START_VOLUME_INVALID": "Enter a valid start volume",
  "BATCH_START_VOLUME_MUST_BE_POSITIVE": "Start volume must be greater than zero",
  "BATCH_END_VOLUME_INVALID": "Enter a valid end volume",
  "BATCH_END_VOLUME_MUST_BE_POSITIVE": "End volume must be greater than zero",
  "INVALID_MODE": "Invalid mode",
  "BATCH_END_BEFORE_START": "End volume must be greater than or equal to start volume",
  "BATCH_TOO_MANY_VOLUMES": "A series or bundle can cover at most 50 volumes",
  "EVENT_NAME_REQUIRED": "Event name is required",
  "EVENT_NAME_TOO_LONG": "Event name must be 200 characters or fewer",
  "EVENT_DATE_INVALID": "Enter a valid event date",
  "EVENT_END_DATE_INVALID": "Enter a valid event end date",
  "REGISTRATION_DEADLINE_INVALID": "Enter a valid registration deadline",
  "ITEM_EDIT_CUTOFF_INVALID": "Enter a valid item edit cutoff date",
  "COMMISSION_RATE_INVALID": "Enter a valid commission rate",
  "COMMISSION_RATE_TOO_LOW": "Commission rate must be at least 0",
  "COMMISSION_RATE_TOO_HIGH": "Commission rate must be at most 1",
  "EVENT_END_DATE_BEFORE_START": "Event end date must be on or after the event date"
```

And the Finnish equivalents into `messages/fi.json`'s `ServiceErrors` namespace:
```json
  "INVALID_EMAIL": "Virheellinen sähköposti",
  "PASSWORD_REQUIRED": "Salasana vaaditaan",
  "NAME_REQUIRED": "Nimi vaaditaan",
  "NAME_TOO_LONG": "Nimi saa olla enintään 100 merkkiä",
  "INVALID_ROLE": "Virheellinen rooli",
  "EVENT_ID_REQUIRED": "Tapahtuma vaaditaan",
  "SELLER_ALIAS_REQUIRED": "Myyjän alias vaaditaan",
  "SELLER_ALIAS_TOO_LONG": "Myyjän alias saa olla enintään 50 merkkiä",
  "SELLER_ALIAS_REQUIRED_FOR_ROLE": "Myyjän alias vaaditaan Myyjä-roolille",
  "TOKEN_REQUIRED": "Token vaaditaan",
  "PASSWORD_TOO_SHORT": "Salasanan on oltava vähintään 10 merkkiä",
  "INVALID_PAYOUT_METHOD": "Virheellinen maksutapa",
  "IBAN_REQUIRED": "Kelvollinen IBAN vaaditaan tilisiirtoa varten",
  "ITEM_NAME_REQUIRED": "Tuotteen nimi vaaditaan",
  "ITEM_NAME_TOO_LONG": "Tuotteen nimi saa olla enintään 200 merkkiä",
  "PRICE_INVALID": "Anna kelvollinen hinta",
  "PRICE_MUST_BE_POSITIVE": "Hinnan on oltava suurempi kuin nolla",
  "PRICE_TOO_HIGH": "Hinta saa olla enintään 100 000",
  "CATEGORY_REQUIRED": "Kategoria vaaditaan",
  "BATCH_BASE_NAME_REQUIRED": "Perusnimi vaaditaan",
  "BATCH_BASE_NAME_TOO_LONG": "Perusnimi saa olla enintään 180 merkkiä",
  "BATCH_START_VOLUME_INVALID": "Anna kelvollinen aloitusosa",
  "BATCH_START_VOLUME_MUST_BE_POSITIVE": "Aloitusosan on oltava suurempi kuin nolla",
  "BATCH_END_VOLUME_INVALID": "Anna kelvollinen lopetusosa",
  "BATCH_END_VOLUME_MUST_BE_POSITIVE": "Lopetusosan on oltava suurempi kuin nolla",
  "INVALID_MODE": "Virheellinen tila",
  "BATCH_END_BEFORE_START": "Lopetusosan on oltava suurempi tai yhtä suuri kuin aloitusosa",
  "BATCH_TOO_MANY_VOLUMES": "Sarja tai erä voi kattaa enintään 50 osaa",
  "EVENT_NAME_REQUIRED": "Tapahtuman nimi vaaditaan",
  "EVENT_NAME_TOO_LONG": "Tapahtuman nimi saa olla enintään 200 merkkiä",
  "EVENT_DATE_INVALID": "Anna kelvollinen tapahtumapäivä",
  "EVENT_END_DATE_INVALID": "Anna kelvollinen tapahtuman päättymispäivä",
  "REGISTRATION_DEADLINE_INVALID": "Anna kelvollinen ilmoittautumisen määräaika",
  "ITEM_EDIT_CUTOFF_INVALID": "Anna kelvollinen tuotteiden muokkauksen takaraja",
  "COMMISSION_RATE_INVALID": "Anna kelvollinen välityspalkkio",
  "COMMISSION_RATE_TOO_LOW": "Välityspalkkion on oltava vähintään 0",
  "COMMISSION_RATE_TOO_HIGH": "Välityspalkkion on oltava enintään 1",
  "EVENT_END_DATE_BEFORE_START": "Tapahtuman päättymispäivän on oltava sama tai myöhempi kuin tapahtumapäivä"
```

- [ ] **Step 5: Update the 4 existing test assertions affected by this task (per the Collision Table)**

In `tests/unit/actions/auth.test.ts`, change (line 32):
```ts
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR')
```
to:
```ts
    if (!result.ok) expect(result.error.code).toBe('INVALID_EMAIL')
```

In `tests/integration/users.test.ts`, change (line 212, the `'rejects a password shorter than 10 characters'` test):
```ts
    expect(result.error.code).toBe('VALIDATION_ERROR')
```
to:
```ts
    expect(result.error.code).toBe('PASSWORD_TOO_SHORT')
```

In `tests/integration/items.test.ts`, change (line 275, the `'rejects when endVolume is less than startVolume'` test):
```ts
    expect(result.error.code).toBe('VALIDATION_ERROR')
```
to:
```ts
    expect(result.error.code).toBe('BATCH_END_BEFORE_START')
```

And (line 288, the `'rejects a range larger than 50 volumes'` test):
```ts
    expect(result.error.code).toBe('VALIDATION_ERROR')
```
to:
```ts
    expect(result.error.code).toBe('BATCH_TOO_MANY_VOLUMES')
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all tests pass, including the 4 updated assertions.

- [ ] **Step 7: Commit**

```bash
git checkout -- tsconfig.json
git add lib/validation/user.ts lib/validation/item.ts lib/validation/event.ts messages/en.json messages/fi.json tests/unit/actions/auth.test.ts tests/integration/users.test.ts tests/integration/items.test.ts
git commit -m "feat: give every Zod validation field a distinct translatable code"
```

---

## Task 3: `lib/services/*.ts` — literal message codes, params for interpolated messages, `RowError` conversion

**Files:**
- Modify: `lib/services/imports.ts`, `lib/services/items.ts`, `lib/services/price-tags.tsx`, `lib/services/profile.ts`, `lib/services/sales.ts`, `lib/services/users.ts`
- Modify: `messages/en.json`, `messages/fi.json` (append this task's codes)
- Test: `tests/integration/sales.test.ts` (2 assertion updates per the Collision Table)

**Interfaces:**
- Consumes: Task 1's widened `Result<T>`/`RowError` types.
- Produces: nothing new consumed by later tasks beyond the `ServiceErrors` keys (Task 5/6 UI components reference these by code).

- [ ] **Step 1: `lib/services/imports.ts`**

Change each of these exact lines:
```ts
    return { ok: false, error: { code: 'FILE_TOO_LARGE', message: 'File exceeds the 2 MB limit' } }
```
stays **unchanged** (code was already distinct, no collision).

```ts
      return { ok: false, error: { code: 'EMPTY_FILE', message: 'No worksheet found' } }
```
stays **unchanged**.

```ts
      return { ok: false, error: { code: 'PARSE_ERROR', message: parsed.errors[0].message } }
```
to:
```ts
      return { ok: false, error: { code: 'PARSE_ERROR', message: 'The file could not be parsed. Please check the format and try again.' } }
```
(Deliberate simplification: `parsed.errors[0].message` was PapaParse's own dynamic internal text, which can't map to one fixed translation key — replaced with a fixed, generic, translatable message. This is the one message in the whole inventory that changes its English wording, because the original wording was never a fixed string to begin with.)

```ts
    return { ok: false, error: { code: 'TOO_MANY_ROWS', message: `File has more than ${MAX_ROWS} rows` } }
```
to:
```ts
    return { ok: false, error: { code: 'TOO_MANY_ROWS', message: `File has more than ${MAX_ROWS} rows`, params: { max: MAX_ROWS } } }
```

```ts
    return { ok: false, error: { code: 'NO_ROWS', message: 'No valid rows to import' } }
```
stays **unchanged**.

```ts
    return { ok: false, error: { code: 'CUTOFF_PASSED', message: 'The item edit cutoff date has passed' } }
```
stays **unchanged** (appears once in this file).

Row-level errors — change:
```ts
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        rowErrors.push({ row: rowNumber, field: String(issue.path[0] ?? 'unknown'), message: issue.message })
      }
      return
    }
```
to:
```ts
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        rowErrors.push({ row: rowNumber, field: String(issue.path[0] ?? 'unknown'), code: issue.message })
      }
      return
    }
```
(`issue.message` here is `importRowSchema`'s own Zod message — this schema is NOT one of the 3 files Task 2 touched, since it's a private, module-local schema inside `imports.ts` itself, not exported from `lib/validation/`. It needs its own codes too — see Step 1b below.)

```ts
    const categoryId = categoryByName.get(parsed.data.categoryName.toLowerCase())
    if (!categoryId) {
      rowErrors.push({ row: rowNumber, field: 'categoryName', message: `Unknown category "${parsed.data.categoryName}"` })
      return
    }
```
to:
```ts
    const categoryId = categoryByName.get(parsed.data.categoryName.toLowerCase())
    if (!categoryId) {
      rowErrors.push({ row: rowNumber, field: 'categoryName', code: 'UNKNOWN_CATEGORY', params: { category: parsed.data.categoryName } })
      return
    }
```

- [ ] **Step 1b: Add codes to `imports.ts`'s private `importRowSchema`**

Change:
```ts
const importRowSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.coerce.number().positive().max(100000),
  categoryName: z.string().min(1),
  isAgeRestricted: z.boolean(),
})
```
to:
```ts
const importRowSchema = z.object({
  name: z.string().min(1, 'ITEM_NAME_REQUIRED').max(200, 'ITEM_NAME_TOO_LONG'),
  price: z.coerce.number('PRICE_INVALID').positive('PRICE_MUST_BE_POSITIVE').max(100000, 'PRICE_TOO_HIGH'),
  categoryName: z.string().min(1, 'CATEGORY_REQUIRED'),
  isAgeRestricted: z.boolean(),
})
```
(Reuses the exact same codes Task 2 already added for `createItemSchema` — same field meanings, one shared set of `ServiceErrors` keys, no duplication.)

- [ ] **Step 2: `lib/services/items.ts`**

Change (all 3 occurrences, identical text):
```ts
    return { ok: false, error: { code: 'CUTOFF_PASSED', message: 'The item edit cutoff date has passed' } }
```
stays **unchanged** at all 3 call sites (already distinct, no collision — shared with `imports.ts`'s single occurrence, same code, same message).

Change (both occurrences):
```ts
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }
```
to:
```ts
    return { ok: false, error: { code: 'ITEM_NOT_FOUND', message: 'Item not found' } }
```
(This appears once in `items.ts`, inside `assertOwnsItemOrIsManager`.)

Change:
```ts
  if (!isOwnItem && !isManager) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'You cannot modify this item' } }
  }
```
to:
```ts
  if (!isOwnItem && !isManager) {
    return { ok: false, error: { code: 'FORBIDDEN_NOT_ITEM_OWNER', message: 'You cannot modify this item' } }
  }
```

(This file's `VALIDATION_ERROR` passthrough lines — `return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }`, ×3 — are unaffected by this task; Task 2 already gave every field of `createItemSchema`/`updateItemSchema`/`createItemBatchSchema` its own code, and this file's passthrough code just keeps forwarding whatever code fired. Leave these 3 lines exactly as they are.)

- [ ] **Step 3: `lib/services/price-tags.tsx`**

Change:
```ts
    return { ok: false, error: { code: 'NO_ITEMS', message: 'No items found for the given ids' } }
```
stays **unchanged**.

Change:
```ts
      return { ok: false, error: { code: 'FORBIDDEN', message: 'You can only generate tags for your own items' } }
```
to:
```ts
      return { ok: false, error: { code: 'FORBIDDEN_NOT_PRICE_TAG_OWNER', message: 'You can only generate tags for your own items' } }
```

- [ ] **Step 4: `lib/services/profile.ts`**

Both occurrences of:
```ts
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }
```
stay **unchanged** (same code, same message as `authz.ts`'s `UNAUTHENTICATED` — already shares the `ServiceErrors.UNAUTHENTICATED` key Task 1 seeded).

(This file's `VALIDATION_ERROR` passthrough — `message: parsed.error.issues[0].message` — is unaffected; `payoutInfoSchema`'s fields already got codes in Task 2.)

- [ ] **Step 5: `lib/services/sales.ts`**

Change:
```ts
    return { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many lookups — please slow down' } }
```
to:
```ts
    return { ok: false, error: { code: 'RATE_LIMITED_LOOKUP', message: 'Too many lookups — please slow down' } }
```

Change:
```ts
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Code not recognized' } }
```
to:
```ts
    return { ok: false, error: { code: 'CODE_NOT_FOUND', message: 'Code not recognized' } }
```

Change (both occurrences, in `recordSale` and `undoSale`):
```ts
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }
```
to:
```ts
    return { ok: false, error: { code: 'ITEM_NOT_FOUND', message: 'Item not found' } }
```

Change (inside the transaction, note the existing `as Result<{ saleId: string }>` cast stays):
```ts
      return { ok: false, error: { code: 'ALREADY_SOLD', message: 'This item has already been sold' } } as Result<{ saleId: string }>
```
stays **unchanged**.

Change:
```ts
    return { ok: false, error: { code: 'NOT_SOLD', message: 'This item is not currently sold' } }
```
stays **unchanged**.

- [ ] **Step 5b: Update `tests/integration/sales.test.ts`'s 2 affected assertions (per the Collision Table)**

Change (line 57, `'returns NOT_FOUND for an unknown code'` — testing `lookupItemByCode`):
```ts
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
```
to:
```ts
    if (!result.ok) expect(result.error.code).toBe('CODE_NOT_FOUND')
```

Change (line 169, `'returns NOT_FOUND for a nonexistent item'` — testing `undoSale`):
```ts
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
```
to:
```ts
    if (!result.ok) expect(result.error.code).toBe('ITEM_NOT_FOUND')
```

- [ ] **Step 6: `lib/services/users.ts`**

Change:
```ts
    return { ok: false, error: { code: 'ALREADY_MEMBER', message: 'User already has a role in this event' } }
```
stays **unchanged**.

Change:
```ts
    return { ok: false, error: { code: 'INVALID_TOKEN', message: 'Invite link is invalid or already used' } }
```
stays **unchanged**.

Change:
```ts
const ALREADY_INITIALIZED_ERROR = { code: 'ALREADY_INITIALIZED', message: 'Setup has already been completed' } as const
```
stays **unchanged**.

(This file's 3 `VALIDATION_ERROR` passthrough lines are unaffected — `inviteUserSchema`/`acceptInviteSchema`/`signupSchema` already got their codes in Task 2.)

- [ ] **Step 7: Append this task's codes to `messages/en.json`'s `ServiceErrors` namespace**

```json
  "FORBIDDEN_NOT_ITEM_OWNER": "You cannot modify this item",
  "FORBIDDEN_NOT_PRICE_TAG_OWNER": "You can only generate tags for your own items",
  "RATE_LIMITED_LOOKUP": "Too many lookups — please slow down",
  "CODE_NOT_FOUND": "Code not recognized",
  "ITEM_NOT_FOUND": "Item not found",
  "ALREADY_SOLD": "This item has already been sold",
  "NOT_SOLD": "This item is not currently sold",
  "CUTOFF_PASSED": "The item edit cutoff date has passed",
  "NO_ITEMS": "No items found for the given ids",
  "FILE_TOO_LARGE": "File exceeds the 2 MB limit",
  "EMPTY_FILE": "No worksheet found",
  "PARSE_ERROR": "The file could not be parsed. Please check the format and try again.",
  "TOO_MANY_ROWS": "File has more than {max} rows",
  "NO_ROWS": "No valid rows to import",
  "UNKNOWN_CATEGORY": "Unknown category \"{category}\"",
  "ALREADY_MEMBER": "User already has a role in this event",
  "INVALID_TOKEN": "Invite link is invalid or already used",
  "ALREADY_INITIALIZED": "Setup has already been completed"
```

And into `messages/fi.json`:
```json
  "FORBIDDEN_NOT_ITEM_OWNER": "Et voi muokata tätä tuotetta",
  "FORBIDDEN_NOT_PRICE_TAG_OWNER": "Voit luoda hintalappuja vain omille tuotteillesi",
  "RATE_LIMITED_LOOKUP": "Liikaa hakuja — hidasta hieman",
  "CODE_NOT_FOUND": "Koodia ei tunnistettu",
  "ITEM_NOT_FOUND": "Tuotetta ei löytynyt",
  "ALREADY_SOLD": "Tämä tuote on jo myyty",
  "NOT_SOLD": "Tämä tuote ei ole tällä hetkellä myyty",
  "CUTOFF_PASSED": "Tuotteiden muokkauksen takaraja on ohitettu",
  "NO_ITEMS": "Annetuilla tunnisteilla ei löytynyt tuotteita",
  "FILE_TOO_LARGE": "Tiedosto ylittää 2 Mt:n rajan",
  "EMPTY_FILE": "Työkirjaa ei löytynyt",
  "PARSE_ERROR": "Tiedostoa ei voitu jäsentää. Tarkista muoto ja yritä uudelleen.",
  "TOO_MANY_ROWS": "Tiedostossa on enemmän kuin {max} riviä",
  "NO_ROWS": "Ei kelvollisia rivejä tuotavaksi",
  "UNKNOWN_CATEGORY": "Tuntematon kategoria \"{category}\"",
  "ALREADY_MEMBER": "Käyttäjällä on jo rooli tässä tapahtumassa",
  "INVALID_TOKEN": "Kutsulinkki on virheellinen tai jo käytetty",
  "ALREADY_INITIALIZED": "Käyttöönotto on jo suoritettu"
```

- [ ] **Step 8: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all tests pass, including the 2 updated assertions in `tests/integration/sales.test.ts`.

- [ ] **Step 9: Commit**

```bash
git checkout -- tsconfig.json
git add lib/services/imports.ts lib/services/items.ts lib/services/price-tags.tsx lib/services/profile.ts lib/services/sales.ts lib/services/users.ts messages/en.json messages/fi.json tests/integration/sales.test.ts
git commit -m "feat: give lib/services error literals distinct codes, add params for interpolated messages"
```

---

## Task 4: `actions/*.ts` — literal message codes

**Files:**
- Modify: `actions/auth.ts`, `actions/sales.ts`, `actions/imports.ts`
- Modify: `messages/en.json`, `messages/fi.json` (append this task's codes)
- Test: `tests/unit/actions/auth.test.ts` (1 assertion update), `tests/unit/actions/sales.test.ts` (2 assertion updates) — both per the Collision Table

**Interfaces:**
- Consumes: Task 1's widened `Result<T>`/`ImportFormState` types.

- [ ] **Step 1: `actions/auth.ts`**

Change:
```ts
    return { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please try again in a minute.' } }
```
to:
```ts
    return { ok: false, error: { code: 'RATE_LIMITED_LOGIN', message: 'Too many login attempts. Please try again in a minute.' } }
```

Change:
```ts
    return { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } }
```
stays **unchanged**.

(This file's `VALIDATION_ERROR` passthrough for `login`'s `loginSchema.safeParse` is unaffected — `loginSchema`'s fields already got codes in Task 2.)

- [ ] **Step 1b: Update `tests/unit/actions/auth.test.ts`'s affected assertion (per the Collision Table)**

Change (line 123):
```ts
    if (!result.ok) expect(result.error.code).toBe('RATE_LIMITED')
```
to:
```ts
    if (!result.ok) expect(result.error.code).toBe('RATE_LIMITED_LOGIN')
```

- [ ] **Step 2: `actions/sales.ts`**

Change:
```ts
    return {
      ok: false,
      error: { code: 'UNEXPECTED_ERROR', message: 'Something went wrong looking up that code. Please try again.' },
    }
```
to:
```ts
    return {
      ok: false,
      error: { code: 'LOOKUP_UNEXPECTED_ERROR', message: 'Something went wrong looking up that code. Please try again.' },
    }
```

Change:
```ts
    return {
      ok: false,
      error: { code: 'UNEXPECTED_ERROR', message: 'Something went wrong recording the sale. Please try again.' },
    }
```
to:
```ts
    return {
      ok: false,
      error: { code: 'RECORD_SALE_UNEXPECTED_ERROR', message: 'Something went wrong recording the sale. Please try again.' },
    }
```

Change:
```ts
    return {
      ok: false,
      error: { code: 'UNEXPECTED_ERROR', message: 'Something went wrong undoing that sale. Please try again.' },
    }
```
to:
```ts
    return {
      ok: false,
      error: { code: 'UNDO_SALE_UNEXPECTED_ERROR', message: 'Something went wrong undoing that sale. Please try again.' },
    }
```
(`tests/unit/actions/sales.test.ts:47,77` assert `.toBe('UNEXPECTED_ERROR')` on the ok:false code for these two tests — check which of the two above each one covers before running; per this task's own file reading, both existing `UNEXPECTED_ERROR` assertions at lines 47 and 77 correspond to `confirmSale`'s and `undoSale`'s catch blocks respectively. Update:)

In `tests/unit/actions/sales.test.ts`, change (line 47, inside the `confirmSale` unexpected-error test):
```ts
      expect(result.error.code).toBe('UNEXPECTED_ERROR')
```
to:
```ts
      expect(result.error.code).toBe('RECORD_SALE_UNEXPECTED_ERROR')
```

And change (line 77, inside the `undoSale` unexpected-error test):
```ts
      expect(result.error.code).toBe('UNEXPECTED_ERROR')
```
to:
```ts
      expect(result.error.code).toBe('UNDO_SALE_UNEXPECTED_ERROR')
```

- [ ] **Step 3: `actions/imports.ts`**

Change:
```ts
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Please choose a file to import' }
  }

  if (intent !== 'preview' && intent !== 'commit') {
    return { status: 'error', message: 'Invalid import action' }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const parsed = await parseImportFile(file.name, buffer)
  if (!parsed.ok) {
    return { status: 'error', message: parsed.error.message }
  }

  const validated = await validateImportRows(session, eventId, parsed.data.rows)
  if (!validated.ok) {
    return { status: 'error', message: validated.error.message }
  }
  const { validRows, rowErrors } = validated.data

  if (intent === 'preview') {
    return { status: 'preview', validCount: validRows.length, rowErrors }
  }

  const result = await commitImport(session, eventId, validRows)
  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }
```
to:
```ts
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', code: 'IMPORT_NO_FILE' }
  }

  if (intent !== 'preview' && intent !== 'commit') {
    return { status: 'error', code: 'IMPORT_INVALID_ACTION' }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const parsed = await parseImportFile(file.name, buffer)
  if (!parsed.ok) {
    return { status: 'error', code: parsed.error.code, params: parsed.error.params }
  }

  const validated = await validateImportRows(session, eventId, parsed.data.rows)
  if (!validated.ok) {
    return { status: 'error', code: validated.error.code, params: validated.error.params }
  }
  const { validRows, rowErrors } = validated.data

  if (intent === 'preview') {
    return { status: 'preview', validCount: validRows.length, rowErrors }
  }

  const result = await commitImport(session, eventId, validRows)
  if (!result.ok) {
    return { status: 'error', code: result.error.code, params: result.error.params }
  }
```
(`rowErrors` needs no change here — `validateImportRows`'s `Result<{ validRows, rowErrors }>` already carries the Task 1/3-widened `RowError[]` through to `ImportFormState`'s `'preview'` variant unchanged.)

- [ ] **Step 4: Append this task's codes to `messages/en.json`'s `ServiceErrors` namespace**

```json
  "RATE_LIMITED_LOGIN": "Too many login attempts. Please try again in a minute.",
  "INVALID_CREDENTIALS": "Incorrect email or password",
  "LOOKUP_UNEXPECTED_ERROR": "Something went wrong looking up that code. Please try again.",
  "RECORD_SALE_UNEXPECTED_ERROR": "Something went wrong recording the sale. Please try again.",
  "UNDO_SALE_UNEXPECTED_ERROR": "Something went wrong undoing that sale. Please try again.",
  "IMPORT_NO_FILE": "Please choose a file to import",
  "IMPORT_INVALID_ACTION": "Invalid import action"
```

And into `messages/fi.json`:
```json
  "RATE_LIMITED_LOGIN": "Liikaa kirjautumisyrityksiä. Yritä uudelleen minuutin kuluttua.",
  "INVALID_CREDENTIALS": "Väärä sähköposti tai salasana",
  "LOOKUP_UNEXPECTED_ERROR": "Jotain meni pieleen koodia haettaessa. Yritä uudelleen.",
  "RECORD_SALE_UNEXPECTED_ERROR": "Jotain meni pieleen myyntiä kirjattaessa. Yritä uudelleen.",
  "UNDO_SALE_UNEXPECTED_ERROR": "Jotain meni pieleen myyntiä peruttaessa. Yritä uudelleen.",
  "IMPORT_NO_FILE": "Valitse tuotava tiedosto",
  "IMPORT_INVALID_ACTION": "Virheellinen tuontitoiminto"
```

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all tests pass, including the 3 updated assertions across `tests/unit/actions/auth.test.ts` and `tests/unit/actions/sales.test.ts`.

- [ ] **Step 6: Commit**

```bash
git checkout -- tsconfig.json
git add actions/auth.ts actions/sales.ts actions/imports.ts messages/en.json messages/fi.json tests/unit/actions/auth.test.ts tests/unit/actions/sales.test.ts
git commit -m "feat: give actions/ error literals distinct codes, widen ImportFormState error construction"
```

---

## Task 5: UI layer, batch 1 — auth pages, event forms, item-add forms

**Files:**
- Modify: `app/(auth)/login/page.tsx`, `app/(auth)/signup/SignupForm.tsx`, `app/(auth)/invite/[token]/page.tsx`, `app/(dashboard)/events/new/CreateEventForm.tsx`, `app/(dashboard)/events/[eventId]/UpdateCommissionForm.tsx`, `app/(dashboard)/events/[eventId]/items/AddItemForm.tsx`, `app/(dashboard)/events/[eventId]/items/AddSeriesForm.tsx`
- Modify: `tests/e2e/locale-phase2.spec.ts` (append a new Finnish spot-check test — see Step 8)

**Interfaces:**
- Consumes: `ServiceErrors` namespace keys from Tasks 1–4 (all now present in both locale files).

All 7 files in this task share the **exact same transformation** — verified against each file's real current content before writing this plan:

**Before** (the pattern, byte-identical across all 7 files except the action name):
```tsx
  const [error, setError] = useState<string | null>(null)
  ...
    if (!result.ok) {
      setError(result.error.message)
      ...
      return
    }
  ...
    {error && (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )}
```

**After** (the pattern every file in this task adopts):
```tsx
  const [error, setError] = useState<{ code: string; message: string; params?: Record<string, string | number> } | null>(null)
  const tErrors = useTranslations('ServiceErrors')
  ...
    if (!result.ok) {
      setError(result.error)
      ...
      return
    }
  ...
    {error && (
      <Alert variant="destructive">
        <AlertDescription>{tErrors(error.code, error.params)}</AlertDescription>
      </Alert>
    )}
```

- [ ] **Step 1: `app/(auth)/login/page.tsx`**

Change:
```tsx
export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('Login')

  async function handleSubmit(formData: FormData) {
    const result = await login(formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    window.location.href = result.data.redirectTo
  }
```
to:
```tsx
export default function LoginPage() {
  const [error, setError] = useState<{ code: string; message: string; params?: Record<string, string | number> } | null>(null)
  const t = useTranslations('Login')
  const tErrors = useTranslations('ServiceErrors')

  async function handleSubmit(formData: FormData) {
    const result = await login(formData)
    if (!result.ok) {
      setError(result.error)
      return
    }
    window.location.href = result.data.redirectTo
  }
```
And change:
```tsx
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
```
to:
```tsx
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{tErrors(error.code, error.params)}</AlertDescription>
              </Alert>
            )}
```

- [ ] **Step 2: `app/(auth)/signup/SignupForm.tsx`**

Apply the identical transformation: `const [error, setError] = useState<string | null>(null)` → the widened type + add `const tErrors = useTranslations('ServiceErrors')` right after the existing `const t = useTranslations('SignupForm')` line; `setError(result.error.message)` → `setError(result.error)`; `<AlertDescription>{error}</AlertDescription>` → `<AlertDescription>{tErrors(error.code, error.params)}</AlertDescription>`.

- [ ] **Step 3: `app/(auth)/invite/[token]/page.tsx`**

Same transformation. Add `const tErrors = useTranslations('ServiceErrors')` after the existing `const t = useTranslations('InvitePage')` line.

- [ ] **Step 4: `app/(dashboard)/events/new/CreateEventForm.tsx`**

Same transformation. Add `const tErrors = useTranslations('ServiceErrors')` after the existing `const t = useTranslations('CreateEventForm')` line.

- [ ] **Step 5: `app/(dashboard)/events/[eventId]/UpdateCommissionForm.tsx`**

Same transformation. Add `const tErrors = useTranslations('ServiceErrors')` after the existing `const t = useTranslations('UpdateCommissionForm')` line.

- [ ] **Step 6: `app/(dashboard)/events/[eventId]/items/AddItemForm.tsx`**

Same transformation. Add `const tErrors = useTranslations('ServiceErrors')` after the existing `const t = useTranslations('AddItemForm')` line.

- [ ] **Step 7: `app/(dashboard)/events/[eventId]/items/AddSeriesForm.tsx`**

Same transformation. Add `const tErrors = useTranslations('ServiceErrors')` after the existing `const t = useTranslations('AddSeriesForm')` line.

- [ ] **Step 8: Write a Finnish spot-check e2e test**

Add to `tests/e2e/locale-phase2.spec.ts` (the existing Finnish UI spot-check file — append a new `test(...)` block after the existing one, don't modify what's there):
```ts
test('a Finnish-locale login failure shows the translated error message', async ({ page }) => {
  await testPrisma.user.create({
    data: {
      name: 'Owner', email: 'owner-errmsg@example.com', isOwner: true,
      passwordHash: await hashPassword('owner-errmsg-pw-123'), locale: 'fi',
    },
  })

  // Login page itself always renders in the default locale (no NEXT_LOCALE
  // cookie exists yet pre-login), matching the established pattern in
  // tests/e2e/locale.spec.ts -- toggle to Finnish explicitly before
  // submitting bad credentials, since this test needs the ERROR to render
  // in Finnish, not just post-login pages.
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /switch to finnish/i }).click()
  await page.getByLabel('Sähköposti').fill('owner-errmsg@example.com')
  await page.getByLabel('Salasana', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: /kirjaudu sisään/i }).click()

  await expect(page.getByText('Väärä sähköposti tai salasana')).toBeVisible()
})
```

- [ ] **Step 9: Run it, verify it passes**

Confirm port 3000 is clear: `netstat -ano | grep :3000` (only `TIME_WAIT` is fine).

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test tests/e2e/locale-phase2.spec.ts`
Expected: PASS, all tests in the file including the new one.

- [ ] **Step 10: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all tests pass unchanged (this task touches no service/action logic, only UI rendering).

Run: `NODE_OPTIONS='--require dotenv/config' npx playwright test`
Expected: all tests pass except the already-documented pre-existing `events.spec.ts` flake — retry that one specifically once before treating it as a regression.

- [ ] **Step 11: Commit**

```bash
git checkout -- tsconfig.json
git add "app/(auth)/login/page.tsx" "app/(auth)/signup/SignupForm.tsx" "app/(auth)/invite/[token]/page.tsx" "app/(dashboard)/events/new/CreateEventForm.tsx" "app/(dashboard)/events/[eventId]/UpdateCommissionForm.tsx" "app/(dashboard)/events/[eventId]/items/AddItemForm.tsx" "app/(dashboard)/events/[eventId]/items/AddSeriesForm.tsx" tests/e2e/locale-phase2.spec.ts
git commit -m "feat: translate error rendering in auth pages, event forms, and item-add forms"
```

---

## Task 6: UI layer, batch 2 — items row, checkout, members, profile, CSV import (+ its row-error table)

**Files:**
- Modify: `app/(dashboard)/events/[eventId]/items/ItemRow.tsx`, `app/(dashboard)/events/[eventId]/checkout/CheckoutScanner.tsx`, `app/(dashboard)/events/[eventId]/checkout/SellBySeller.tsx`, `app/(dashboard)/events/[eventId]/items/import/ImportForm.tsx`, `app/(dashboard)/events/[eventId]/members/InviteMemberForm.tsx`, `app/(dashboard)/profile/PayoutInfoForm.tsx`

**Interfaces:**
- Consumes: `ServiceErrors` namespace keys from Tasks 1–4.

- [ ] **Step 1: `app/(dashboard)/events/[eventId]/items/ItemRow.tsx`**

Same transformation as Task 5's uniform pattern. Add `const tErrors = useTranslations('ServiceErrors')` after the existing `const tStatus = useTranslations('ItemStatus')` line. Change:
```tsx
      if (!result.ok) {
        setError(result.error.message)
        return
      }
```
to:
```tsx
      if (!result.ok) {
        setError(result.error)
        return
      }
```
And the `useState` line and `<AlertDescription>{error}</AlertDescription>` per the uniform pattern.

- [ ] **Step 2: `app/(dashboard)/events/[eventId]/checkout/SellBySeller.tsx`**

This one's `setError` calls are one-liners, not multi-statement blocks. Change:
```tsx
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
```
to:
```tsx
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<{ code: string; message: string; params?: Record<string, string | number> } | null>(null)
  const tErrors = useTranslations('ServiceErrors')

  function handleSell() {
    startTransition(async () => {
      const result = await confirmSale(eventId, item.id, 'MANUAL_OVERRIDE')
      setError(result.ok ? null : result.error)
    })
  }

  function handleUndo() {
    startTransition(async () => {
      const result = await undoSale(eventId, item.id)
      setError(result.ok ? null : result.error)
    })
  }
```
And change:
```tsx
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
```
to:
```tsx
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tErrors(error.code, error.params)}</AlertDescription>
        </Alert>
      )}
```
(This is inside `SellableItemRow`, the module-local component at the top of the file — `SellBySeller`, the exported component below it, already has its own unrelated `tCommon`/`t` hooks that stay untouched.)

- [ ] **Step 3: `app/(dashboard)/events/[eventId]/checkout/CheckoutScanner.tsx`**

This file's `message` state mixes translated success strings (`t('alreadySold', ...)`, `t('sold', ...)`) with what's currently a raw error string — the union needs to hold both. Change:
```tsx
export function CheckoutScanner({ eventId }: { eventId: string }) {
  const t = useTranslations('CheckoutScanner')
  const tCommon = useTranslations('Common')
  const [code, setCode] = useState('')
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [lookup])

  async function handleCodeSubmit() {
    if (!code.trim()) return
    setMessage(null)
    const result = await lookupCode(eventId, code.trim())
    setCode('')
    if (!result.ok) {
      setMessage(result.error.message)
      setLookup(null)
      return
    }
    if (result.data.status === 'SOLD') {
      setMessage(t('alreadySold', { name: result.data.name }))
      setLookup(null)
      return
    }
    setLookup(result.data)
  }

  async function handleConfirm() {
    if (!lookup) return
    setPending(true)
    const result = await confirmSale(eventId, lookup.itemId, 'BARCODE_SCAN')
    setPending(false)
    setMessage(result.ok ? t('sold', { name: lookup.name }) : result.error.message)
    setLookup(null)
  }
```
to:
```tsx
export function CheckoutScanner({ eventId }: { eventId: string }) {
  const t = useTranslations('CheckoutScanner')
  const tCommon = useTranslations('Common')
  const tErrors = useTranslations('ServiceErrors')
  const [code, setCode] = useState('')
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [lookup])

  async function handleCodeSubmit() {
    if (!code.trim()) return
    setMessage(null)
    const result = await lookupCode(eventId, code.trim())
    setCode('')
    if (!result.ok) {
      setMessage(tErrors(result.error.code, result.error.params))
      setLookup(null)
      return
    }
    if (result.data.status === 'SOLD') {
      setMessage(t('alreadySold', { name: result.data.name }))
      setLookup(null)
      return
    }
    setLookup(result.data)
  }

  async function handleConfirm() {
    if (!lookup) return
    setPending(true)
    const result = await confirmSale(eventId, lookup.itemId, 'BARCODE_SCAN')
    setPending(false)
    setMessage(result.ok ? t('sold', { name: lookup.name }) : tErrors(result.error.code, result.error.params))
    setLookup(null)
  }
```
(`message` stays `string | null` unchanged here — simpler than the other files, since the translation happens immediately at the point of setting state rather than at render time. No change needed to the `{message && <AlertDescription>{message}</AlertDescription>}` render block.)

- [ ] **Step 4: `app/(dashboard)/events/[eventId]/items/import/ImportForm.tsx`**

Two independent widenings in this file: the top-level form error (`state.status === 'error'`) and the row-error table (`state.rowErrors[].message`). Note: `RowError.code` and `ImportFormState`'s `'error'` variant's `code` are typed optional (`code?: string`) — a leftover of Task 1's additive widening, kept optional at the type level only so Tasks 1 through 5 kept compiling before Tasks 3/4 converted every construction site to always set `code`. By the time this task runs, Tasks 3 and 4 have already landed and every real construction site sets `code` unconditionally, so `state.code!`/`e.code!` below (non-null assertion) is safe — there is no runtime path left that constructs one of these without `code`. Change:
```tsx
export function ImportForm({ eventId }: { eventId: string }) {
  const t = useTranslations('ImportForm')
  const [state, formAction, isPending] = useActionState(handleImportForm.bind(null, eventId), initialState)
```
to:
```tsx
export function ImportForm({ eventId }: { eventId: string }) {
  const t = useTranslations('ImportForm')
  const tErrors = useTranslations('ServiceErrors')
  const [state, formAction, isPending] = useActionState(handleImportForm.bind(null, eventId), initialState)
```
Change:
```tsx
      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
```
to:
```tsx
      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{tErrors(state.code!, state.params)}</AlertDescription>
        </Alert>
      )}
```
Change:
```tsx
                {state.rowErrors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.row}</TableCell>
                    <TableCell>{e.field}</TableCell>
                    <TableCell>{e.message}</TableCell>
                  </TableRow>
                ))}
```
to:
```tsx
                {state.rowErrors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.row}</TableCell>
                    <TableCell>{e.field}</TableCell>
                    <TableCell>{tErrors(e.code!, e.params)}</TableCell>
                  </TableRow>
                ))}
```

- [ ] **Step 5: `app/(dashboard)/events/[eventId]/members/InviteMemberForm.tsx`**

Same uniform pattern as Task 5. Add `const tErrors = useTranslations('ServiceErrors')` after the existing `const tRoles = useTranslations('Roles')` line. Change:
```tsx
  async function handleSubmit(formData: FormData) {
    const result = await inviteMember(eventId, formData)
    if (!result.ok) {
      setError(result.error.message)
      setInvited(undefined)
      return
    }
    setError(null)
    setInvited(result.data)
  }
```
to:
```tsx
  async function handleSubmit(formData: FormData) {
    const result = await inviteMember(eventId, formData)
    if (!result.ok) {
      setError(result.error)
      setInvited(undefined)
      return
    }
    setError(null)
    setInvited(result.data)
  }
```
Plus the `useState` type widening and `<AlertDescription>{error}</AlertDescription>` → `<AlertDescription>{tErrors(error.code, error.params)}</AlertDescription>` per the uniform pattern.

- [ ] **Step 6: `app/(dashboard)/profile/PayoutInfoForm.tsx`**

Same uniform pattern as Task 5. Add `const tErrors = useTranslations('ServiceErrors')` after the existing `const t = useTranslations('PayoutInfoForm')` line, plus the same 3-part transformation (useState type, `setError(result.error)`, `tErrors(error.code, error.params)`).

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all tests pass unchanged.

Confirm port 3000 is clear, then run: `NODE_OPTIONS='--require dotenv/config' npx playwright test`
Expected: all tests pass except the already-documented pre-existing `events.spec.ts` flake — retry once before treating it as a regression. Pay particular attention to `tests/e2e/checkout.spec.ts`, `tests/e2e/import.spec.ts`, `tests/e2e/manual-sale.spec.ts`, `tests/e2e/items.spec.ts` — these exercise the 6 files this task touches most directly.

- [ ] **Step 8: Commit**

```bash
git checkout -- tsconfig.json
git add "app/(dashboard)/events/[eventId]/items/ItemRow.tsx" "app/(dashboard)/events/[eventId]/checkout/CheckoutScanner.tsx" "app/(dashboard)/events/[eventId]/checkout/SellBySeller.tsx" "app/(dashboard)/events/[eventId]/items/import/ImportForm.tsx" "app/(dashboard)/events/[eventId]/members/InviteMemberForm.tsx" "app/(dashboard)/profile/PayoutInfoForm.tsx"
git commit -m "feat: translate error rendering in items row, checkout, import, members, and profile forms"
```

---

## Task 7: Completeness guard, e2e spot-checks, docs

**Files:**
- Test: new `tests/unit/service-errors-completeness.test.ts`
- Modify: `tests/e2e/locale-phase2.spec.ts` (append a checkout-area Finnish spot-check test — see Step 3)
- Modify: `docs/next-steps.md`

**Interfaces:**
- Consumes: the complete, final `ServiceErrors` namespace and every `code`-returning call site across the whole codebase — this task can only run once Tasks 1–6 are all done.

- [ ] **Step 1: Write the completeness guard test**

`tests/unit/service-errors-completeness.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import en from '@/messages/en.json'
import fi from '@/messages/fi.json'

describe('ServiceErrors message parity', () => {
  it('has the exact same set of keys in both locales', () => {
    const enKeys = Object.keys(en.ServiceErrors).sort()
    const fiKeys = Object.keys(fi.ServiceErrors).sort()
    expect(fiKeys).toEqual(enKeys)
  })

  it('has no empty translated values in either locale', () => {
    for (const [key, value] of Object.entries(en.ServiceErrors)) {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
    for (const [key, value] of Object.entries(fi.ServiceErrors)) {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
  })
})
```
(This is a parity/shape guard, not a full source-scan — a source-scanning variant would need to parse every `.ts`/`.tsx` file for `code: '...'` literals and Zod message strings, which is disproportionate tooling for this app's size. Parity between the two locale files is the same class of regression guard the what's-new notification feature already established for its own content file, scoped to what's cheaply and reliably checkable.)

- [ ] **Step 2: Run it, verify it passes**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/service-errors-completeness.test.ts`
Expected: PASS, both tests — this proves Tasks 1–6 left `messages/en.json` and `messages/fi.json`'s `ServiceErrors` namespaces in parity.

- [ ] **Step 3: Add one checkout-area Finnish e2e spot-check**

Add to `tests/e2e/locale-phase2.spec.ts` (the same file Task 5 already appended to), a second new test:
```ts
test('a Finnish-locale staff member sees the translated already-sold error at checkout', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner-checkout-err@example.com', isOwner: true, passwordHash: await hashPassword('owner-checkout-err-pw1') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller-checkout-err@example.com', passwordHash: 'x' } })
  await testPrisma.eventMembership.create({ data: { userId: seller.id, eventId: event.id, role: 'SELLER', status: 'ACTIVE' } })
  await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Already Sold', price: 5, categoryId: category.id, barcodeValue: 'SOLDCODEFI1', status: 'SOLD' },
  })
  const staff = await testPrisma.user.create({
    data: {
      name: 'Staff', email: 'staff-checkout-err@example.com',
      passwordHash: await hashPassword('staff-checkout-err-pw1'), locale: 'fi',
    },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })

  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('staff-checkout-err@example.com')
  await page.getByLabel('Password', { exact: true }).fill('staff-checkout-err-pw1')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.goto(`/events/${event.id}/checkout`)
  await page.waitForLoadState('networkidle')
  const input = page.getByPlaceholder('Skannaa tai kirjoita koodi ja paina Enter')
  await input.fill('SOLDCODEFI1')
  await input.press('Enter')

  await expect(page.getByText('Jo myyty: Already Sold')).toBeVisible()
})
```
(Scanning an item that's already `status: 'SOLD'` triggers `CheckoutScanner.handleCodeSubmit`'s `result.data.status === 'SOLD'` branch — `t('alreadySold', { name })`, Finnish `"Jo myyty: {name}"` — not the `sold` key, which only fires after a successful *new* confirm. This branch is already translated from Phase 2 — included here specifically to confirm this task's changes to `CheckoutScanner.tsx` didn't regress that pre-existing translated path, since Step 3 of Task 6 touched the same function. A genuinely *new* server-error translation would need an item sold in the 30ms race window between two scans, which isn't reliably reproducible in a test — the `ALREADY_SOLD` service-layer code path is already covered by `tests/integration/sales.test.ts`'s existing unit-level coverage of `recordSale`, and this e2e test's job is proving the UI plumbing around it, which the already-sold branch exercises identically.)

- [ ] **Step 4: Run it, verify it passes**

Confirm port 3000 is clear, then run: `NODE_OPTIONS='--require dotenv/config' npx playwright test tests/e2e/locale-phase2.spec.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Update `docs/next-steps.md`**

Replace item 3's "Remaining" bullet in the `## Open` section:
```markdown
3. **No language switching** — DONE
   - Phase 1 (infrastructure, `User.locale` persistence, the flag toggle, and translated `/login` + event-home nav), Phase 2 (every remaining page's static UI strings — events, items, checkout, sales, members, admin/audit/profile, signup/invite — plus a shared `Roles` label lookup), Phase 3 (the `Unknown` seller-alias fallback), and the final piece — every server-side error/validation message — are all done. See `docs/superpowers/specs/2026-09-10-i18n-language-switching-design.md`, `docs/superpowers/specs/2026-09-21-i18n-error-messages-design.md`, and the plans under `docs/superpowers/plans/`.
   - The final piece: `Result<T>`'s error shape widened to `{ code, message, params? }`. `lib/services`/`actions` stay framework-agnostic — every error/validation message is translated client-side by `code` via a new `ServiceErrors` `next-intl` namespace (`t(error.code, error.params)`), the same mechanism as every other translated string in this app. Every Zod schema field (across `lib/validation/*.ts` and one private schema in `lib/services/imports.ts`) now carries an explicit, distinct code instead of a blanket `VALIDATION_ERROR` — Zod's own `message` customization parameter, just holding a code string instead of prose.
   - To add a new server-side error in the future: give it a distinct `code` (check it doesn't collide with an existing one carrying a different meaning — `ServiceErrors`' English/Finnish keys are the source of truth for what's taken), add the `en`/`fi` pair to `messages/*.json`'s `ServiceErrors` namespace, and if the message needs an interpolated value, thread it through as `params`. `tests/unit/service-errors-completeness.test.ts` guards that both locale files stay in parity, but does not catch a genuinely missing key on first use — add the `ServiceErrors` entry in the same commit as the code that returns it.
```

- [ ] **Step 6: Final full-suite verification**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all tests pass (the exact count will be higher than this repo's pre-plan baseline by the number of new tests this plan added — 2 in `service-errors-completeness.test.ts` — confirm the reported total makes sense relative to whatever the baseline was when Task 1 started, rather than a specific hardcoded number, since this plan doesn't control what other work may have landed on `main` before this branch started).

Confirm port 3000 is clear, then run: `NODE_OPTIONS='--require dotenv/config' npx playwright test`
Expected: all tests pass except the already-documented pre-existing `events.spec.ts` flake.

- [ ] **Step 7: Commit**

```bash
git checkout -- tsconfig.json
git add tests/unit/service-errors-completeness.test.ts tests/e2e/locale-phase2.spec.ts docs/next-steps.md
git commit -m "test: add ServiceErrors parity guard, e2e spot-checks; close out the language-switching next-step"
```
