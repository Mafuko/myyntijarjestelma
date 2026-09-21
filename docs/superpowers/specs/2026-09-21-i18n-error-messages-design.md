# Server-Side Error/Validation Message Translation — Design Spec

Status: **approved, pending implementation plan**
Source: `docs/next-steps.md` item 3's "Remaining" bullet — the one piece of the language-switching effort deliberately deferred out of every prior i18n phase ("translating these means changing the shared `Result<T>` convention... a bigger decision than adding more translated pages"), brainstormed and approved in-session on 2026-09-21.

## Problem

Every other user-facing string in the app is now translated (Phases 1–3: infrastructure, every page, the seller-alias fallback). The one remaining gap: every server-side error and validation message — login failures, Zod field-validation errors, business-rule errors ("This item has already been sold"), rate-limit messages — is still hardcoded English, rendered as-is regardless of the signed-in user's locale.

## Scope survey (from brainstorming)

A dedicated inventory pass found the actual blast radius before any design decision was made:

- **~24 distinct literal English error strings** across 7 `lib/services/*.ts` files (`authz.ts`, `imports.ts`, `items.ts`, `price-tags.tsx`, `profile.ts`, `sales.ts`, `users.ts`) and 3 `actions/*.ts` files (`auth.ts`, `imports.ts`, `sales.ts`).
- **10 call sites** across services/actions that pass a raw Zod `issues[0].message` straight through as the error, all currently sharing one generic `VALIDATION_ERROR` code regardless of which field/rule actually failed.
- **6 distinct custom Zod `.refine()`/`.min()` message strings** across 3 validation files (`lib/validation/item.ts`, `user.ts`, `event.ts`) — plus every field in those schemas that has NO custom message today, silently relying on Zod's own untranslated built-in text (e.g. plain `.email()`, `.min(1)`).
- **2 messages with interpolated runtime values** (`"File has more than {N} rows"`, `Unknown category "X"`), which don't fit a pure code-lookup without also carrying the interpolation data.
- **Row-level CSV import errors** (`RowError = { row, field, message }` in `lib/services/imports.ts`) are a parallel, non-`Result<T>` shape carrying the same class of problem (a per-row Zod passthrough, plus the templated "Unknown category" message).
- **13 UI components** (all under `app/**`) currently do `setError(result.error.message)` / equivalent and render the raw string directly via a local `<Alert><AlertDescription>{error}</AlertDescription></Alert>`.

Full literal-by-literal inventory (every code, every current English string, every file:line) lives in this session's scope-survey — the implementation plan re-derives and enumerates it per task rather than duplicating it here.

## Scope decisions (from brainstorming)

- **Translate by `error.code`, entirely client-side — services and actions never see a locale.** Every error already carries a stable `code` (e.g. `FORBIDDEN`, `ALREADY_SOLD`). UI components look the message up via `next-intl`'s `useTranslations`, the same mechanism every other string in this app already uses. This preserves the precedent set in i18n Phase 3 (`lib/services` stays 100% framework-agnostic) rather than threading `locale` into every service call the way the one price-tag-PDF exception currently does.
- **Every Zod validation issue gets its own distinct, translatable code — not one blanket `VALIDATION_ERROR`.** This means auditing every field in `lib/validation/item.ts`/`user.ts`/`event.ts` and giving each one an explicit `message` (Zod's own supported customization parameter on every check and `.refine()`) whose payload is a code string instead of English prose — including fields that today rely on Zod's own untranslated built-in defaults (`.email()`, bare `.min(1)`, etc). Zod treats that string as opaque; it never inspects or requires it to be human-readable, so this is straightforwardly Zod's own API, not a workaround.
- **`Result<T>`'s error shape widens with an optional `params` field**, not a breaking replacement: `{ code: string; message: string; params?: Record<string, string | number> }`. `message` stays as the English fallback (logs, and any caller not yet updated during rollout) so this is backward-compatible — a caller that still just renders `.message` keeps working unchanged mid-rollout, rather than every one of the ~26 touched files needing to land atomically.
- **`RowError` gets the same treatment**: widened to `{ row: number; field: string; code: string; params?: Record<string, string | number> }`, covering both the per-row Zod passthrough and the templated "Unknown category" message.
- **13 UI components switch from storing/rendering a raw string to storing the whole error object** (`setError(result.error)` instead of `setError(result.error.message)`) and rendering via `t(error.code, error.params)`.
- **One plan, many SDD tasks, shipped as a single feature** — not split into separate phases shipped over time. Given the size (7 service files + 3 action files + 3 validation files + 13 UI components), the implementation plan breaks this into tasks grounded in real file boundaries (validation-layer code conversion + namespace seed; service-layer literal-to-code conversion, grouped by file; UI-layer rendering switch, grouped by page/feature area; CSV import's parallel `RowError` path).
- **Out of scope:** translating third-party library output beyond Zod (none currently surfaces to users); any change to which errors are shown vs. logged (purely a translation pass, not a UX redesign); the one existing inconsistency noted during the survey (`app/(dashboard)/admin/page.tsx` doesn't render its `deleteUserPii` Result's error message at all today) — flagged for a separate, unrelated bug fix, not folded into this scope.

## Architecture

**New namespace.** `messages/en.json`/`fi.json` gain a `ServiceErrors` namespace, one key per distinct error code found in the survey (the ~24 service/action literals) plus one key per Zod field/rule code introduced across the 3 validation files plus the CSV row-error codes. Interpolated codes (`TOO_MANY_ROWS`, `UNKNOWN_CATEGORY`) use `next-intl`'s existing `{param}` interpolation syntax, matching how every other parameterized string in this app already works (e.g. `SalesDashboard.revenueSummary`).

**`Result<T>` type.** The shared type (currently duplicated as a local `type Result<T> = ...` alias at the top of most service/action files, per this repo's existing convention) widens to:
```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; params?: Record<string, string | number> } }
```

**Service/action layer.** Every literal English `message` string becomes the English fallback text unchanged (kept for logs and non-rollout-yet callers); the `code` becomes the actual differentiator UI components key off. Where a message today is a template literal with an interpolated value (row count, category name), that value moves into a new `params` field alongside a stable `code`, with `message` becoming a plain English template rendered server-side as today (for the fallback/log path only).

**Zod validation.** Every schema field in `lib/validation/item.ts`/`user.ts`/`event.ts` gets an explicit `message` parameter carrying a code (e.g. `z.string().email('INVALID_EMAIL')`, `.min(10, 'PASSWORD_TOO_SHORT')`, `.refine(fn, { message: 'IBAN_REQUIRED', path: [...] })`) — including fields with no custom message today. `parsed.error.issues[0].message` passthrough sites in `lib/services/*.ts`/`actions/auth.ts` are otherwise unchanged; they were already forwarding whatever string sat in that slot, which is now a code instead of prose.

**CSV import row errors.** `lib/services/imports.ts`'s `RowError` type and its two push sites widen to carry `code`/`params` the same way, and `ImportForm.tsx`'s row-error table renders via the same `t(code, params)` pattern as everywhere else.

**UI components.** All 13 call sites switch their local error state from `string | null` to the whole error object (or `null`), and add `useTranslations('ServiceErrors')` alongside whatever namespace they already use, rendering `t(error.code, error.params)` instead of the raw string.

## Testing

- **Unit/integration**: existing tests in `tests/unit/`/`tests/integration/` that currently assert on literal English error text (e.g. `expect(result.error.message).toBe('This item has already been sold')`) get updated to assert on `error.code` instead — the code is the stable contract now, English prose is just the fallback. A pass through every existing test file touching a changed service/action confirms none silently break on the string-to-code swap.
- **New**: a Zod-schema-level unit test suite confirming every field across the 3 validation files produces a resolvable `ServiceErrors` key (i.e., no schema field emits a raw prose string or an unmapped code) — this is the automated guard against the class of silent-forever-invisible-error the earlier what's-new-notification content-shape test already demonstrated is worth having for exactly this kind of "every entry must satisfy an invariant" risk.
- **E2E**: a small number of existing e2e tests that assert on literal English error text on-screen (e.g. `page.getByText('Incorrect email or password')`) get updated to assert on the Finnish text instead, for at least one representative flow per major area (login, item validation, checkout), proving the translation actually reaches the DOM end-to-end — not exhaustive per-message e2e coverage, matching this app's established "spot-check in e2e, exhaustive in unit tests" calibration from every prior i18n phase.

## Housekeeping

- No new environment variables, no schema/migration changes (this only touches TypeScript types and message catalogs, no `User`/`Item`/etc. column changes).
- Update `docs/next-steps.md`: mark item 3's "Remaining" bullet done once shipped, closing out the whole language-switching item (Phases 1–3 plus this).
- `docs/deployment.md`: no changes expected.
