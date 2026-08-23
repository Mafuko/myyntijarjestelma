# Myyntijärjestelmä — Design Spec

Status: **complete, pending final review**
Source requirements: [Myyntijärjestelmä.pdf](../../../Myyntijärjestelmä.pdf), [CLAUDE.md](../../../CLAUDE.md)

## Scope decisions (from brainstorming)

- **Tech stack:** Next.js 15 (App Router) + TypeScript, deployed on Vercel.
- **V1 scope:** full role-based access (Seller/Staff/Admin) from day one, not deferred.
- **Auth:** email + password via Auth.js (NextAuth v5), argon2id password hashing, database-backed sessions (revocable).
- **Barcode scanning:** support both a USB/Bluetooth HID (keyboard-wedge) scanner and camera-based scanning later; keyboard-wedge input flow is the v1 baseline.
- **Google Sheets import:** file upload (CSV/XLSX export), not a live Google Sheets API integration — keeps external API/OAuth scope surface out of the trust boundary.
- **Payments:** IBAN/cash preference is reference data only for the organizer to pay out manually. No payment/payout API integration.
- **Multi-tenancy:** single organizer (you) running multiple events. Not building cross-organization tenant isolation.
- **Real-time updates:** Server-Sent Events (SSE) push sale updates to sellers/staff, rather than polling.
- **Security is an explicit priority** for this project — this shapes several choices below (see Section 3, pending).

## Section 1: High-level architecture

- **Framework:** Next.js 15 App Router + TypeScript. Server Components for reads, Server Actions for mutations, Route Handlers only where a true HTTP endpoint is needed (PDF download, SSE stream).
- **Data layer:** Postgres (Neon) via Prisma ORM — parameterized queries by default (no SQL injection surface from hand-built SQL), typed migrations.
- **Auth:** Auth.js (NextAuth v5), credentials provider, argon2id password hashing, database-backed sessions (revocable by deleting the session row — e.g. to immediately ban a user).
- **Real-time:** SSE via a Route Handler that polls Postgres for the caller's scoped sales snapshot every ~2 seconds and pushes the full current state each tick (not an in-process event emitter — Vercel serverless functions aren't guaranteed to keep the process that handled a sale mutation and the process serving a given SSE connection as the same instance, so any handoff has to go through the database, not process memory). Resending full state each tick is cheap at this scale, and it means a reconnect after a dropped connection naturally re-syncs without any special "did I miss an event" handling — this doubles as the answer to the error-handling requirement in Section 5.
- **File generation:**
  - PDF price tags: `@react-pdf/renderer` or `pdf-lib`, generated server-side only, streamed as a download.
  - Barcodes: `bwip-js` (server-side barcode image generation, Code128), embedded into the price tag PDF.
  - CSV/XLSX import parsing: `papaparse` (CSV) / `exceljs` (XLSX), server-side only, validated against a strict `zod` schema before anything touches the database.
- **Layering:** `app/` (routes/pages) → Server Actions (`actions/`) → service layer (`lib/services/`, encapsulates business rules) → Prisma. Authorization guards (`requireRole()` / `requireEventAccess()`) live at the service layer boundary so every mutation path is forced through the same check — not scattered `if` checks in route code.
- **Rate limiting:** Upstash Redis (serverless-friendly; see Section 4).
- **Testing:** Vitest (unit/integration), Playwright (E2E) (see Section 6).

## Section 2: Data model

**Key modeling decision:** roles are scoped **per event**, not global. A user registers as Myyjä for one event and could be Työvoima at another — matches the PDF's "ilmoittautua myyjäksi tiettyyn tapahtumaan" and keeps "who you are" separate from "what you can do in this event." The organizer has `User.isOwner` and is implicitly Ylläpitäjä everywhere, without needing a membership row per event.

**Entities:**

- **User** — id, name, email (unique), passwordHash, phone, payoutMethod (`CASH` \| `BANK_TRANSFER`), iban (nullable, required if `BANK_TRANSFER`), isOwner (bool), timestamps.
- **Event** — id, name, eventDate, registrationDeadline, itemEditCutoffDate, commissionRate (Decimal, default 0.10), createdByUserId, timestamps.
- **EventMembership** — userId, eventId, role (`SELLER` \| `STAFF` \| `ADMIN`), sellerAlias (nickname shown on price tags, required for `SELLER`), status (`ACTIVE` \| `REMOVED`). Single source of truth for what a user can do in a given event.
- **Category** — id, eventId, name. Per-event configurable dropdown (seeded with defaults on event creation) rather than a hardcoded enum.
- **Item** — id, eventId, sellerId, name, price (Decimal — not float, to avoid rounding errors), categoryId, isAgeRestricted (K-18 bool), barcodeValue (globally unique, server-generated — never user-supplied), status (`LISTED` \| `SOLD` \| `REMOVED`), timestamps.
- **Sale** — id, itemId, soldByUserId, soldAt, method (`BARCODE_SCAN` \| `MANUAL_CODE_ENTRY` \| `MANUAL_OVERRIDE`). Its own row (not just a flag on Item) so there's an audit trail of who recorded each sale and how.
- **AuditLog** — id, actorUserId, action, targetType, targetId, metadata (jsonb), createdAt. Records security-sensitive admin actions (role changes, item deletions, commission rate edits).

**Permission mapping** (enforced by `requireEventAccess()`):
- `SELLER`: CRUD only their own Items in that event, only before `itemEditCutoffDate`; read-only on their own Sales.
- `STAFF`: read all Items/Sales for that event; can create Sale records (scan/confirm flow).
- `ADMIN`: everything above, plus managing Event settings, EventMemberships, and viewing AuditLog.

## Section 3: Core flows

**1. Event & membership setup**
Admin (you) creates an Event (name, date, registration deadline, item-edit cutoff, commission rate). Admin adds a seller/staff EventMembership by email; if the user doesn't exist yet, an invited account is created in a `PENDING` state with a unique invite token. The admin copies the invite link and sends it themselves via their own email (matches the current manual process) — the system does not send transactional email in v1. Visiting the invite link lets the invited user set a password, which activates the account and membership.

**2. Item listing (seller)**
Two entry paths, both funnel through the same `zod`-validated create logic:
- **Manual add** — a quick-repeat form: after adding an item, the form stays populated so a seller can tweak just name/price for the next item in a series (e.g. manga volumes) without re-filling category/K-18 each time.
- **Bulk import** — seller uploads a CSV/XLSX (exported from their Google Sheet). Server parses it, validates every row against the Item schema, and shows a preview with per-row errors before committing — nothing is written until the seller confirms the whole batch.

Both paths are blocked server-side once `Event.itemEditCutoffDate` has passed (checked in the service layer, not just hidden in the UI).

**3. Price tag generation**
Admin (or seller, for their own items) triggers "generate price tags" for a set of items. Server assigns each `Item` a `barcodeValue` (generated once, stable thereafter), renders one tag per item (name, price, seller alias, K-18 flag if set, barcode + human-readable fallback code underneath), and streams a combined PDF back as a download.

**4. Checkout / scan flow (Staff, Admin)**
A dedicated "Checkout" screen with a single auto-focused input. A HID scanner "typing" a barcode followed by Enter, or a staff member manually typing the fallback code followed by Enter, are the same code path. On Enter: server looks up the `Item` by `barcodeValue`, returns item name/price/seller alias; UI shows a confirm popup ("Selling <name>, confirm?"); a second Enter calls `recordSale`, which creates a `Sale` row, flips `Item.status` to `SOLD`, and publishes an SSE event. If the code doesn't match any `LISTED` item, the UI shows an inline error instead of the confirm popup.

**5. Real-time sales view (Seller / Staff / Admin)**
Each dashboard subscribes to an SSE stream scoped server-side to what that role is allowed to see (a seller's stream is filtered to their own items server-side, not client-side). On each sale event, rows update live: sold/unsold split, running total revenue, and commission owed (`revenue × Event.commissionRate`).

## Section 4: Security hardening

All of the following is **MVP-scope**, not deferred — it's foundational rather than a feature.

**Input validation & injection defense**
- Every Server Action validates input against a `zod` schema server-side. No client-only validation.
- CSV/XLSX import: enforce max file size and max row count before parsing (defends against decompression-bomb-style files); every parsed row goes through the same `zod` schema as manual entry.
- Prisma's parameterized queries mean no raw SQL string-building anywhere.

**Auth & session hardening**
- Rate-limit login attempts and the barcode-lookup endpoint (stops brute-forcing valid codes) using Upstash Redis — serverless-friendly, survives across Vercel's stateless function instances (in-memory limiting would not).
- Auth.js session cookies: `httpOnly`, `secure`, `sameSite=lax` (defaults, not weakened).
- Server Actions get Next.js's built-in Origin-header CSRF protection automatically.
- Minimum password length/complexity enforced at signup.

**Race condition: preventing double-sells**
- `recordSale` runs as a single DB transaction that only flips `Item.status` from `LISTED` to `SOLD` if it's still `LISTED` (atomic conditional update, not read-then-write) — two staff scanning the same barcode within milliseconds results in one sale + one "already sold" error, never a duplicate.

**PII / GDPR** (Finland/EU; phone, email, IBAN are regulated personal data)
- IBAN encrypted at rest (application-level encryption, not just disk encryption).
- Sensitive fields (password, IBAN) never written to application logs.
- Admin has a way to delete a user's PII (right-to-erasure) — sales history can be retained with personal fields nulled out, rather than cascading-deleting records.

**Transport & headers**
- HTTPS enforced automatically by Vercel.
- Security headers (CSP, `X-Frame-Options: DENY`, `Strict-Transport-Security`) set via Next.js middleware.

**Secrets**
- All credentials (DB URL, Auth.js secret, Redis URL) via Vercel environment variables, never committed; `.env*` in `.gitignore` from the first commit.

**Audit trail**
- `AuditLog` is written on every role change, item deletion by an admin (not the owning seller), and commission-rate edit.

**Explicitly deferred (not MVP):** breached-password checking (HaveIBeenPwned API), 2FA, camera-based barcode scanning.

## Section 5: Error handling

**Server Action / mutation errors** — a discriminated-result convention: every Server Action returns `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. Clients branch on `ok` and show the message inline (form errors) or as a toast (general failures) — no raw stack traces or Prisma error messages reach the browser. Unhandled exceptions are caught at a top-level wrapper around every Server Action, logged server-side with context (user id, action name), and turned into a generic "something went wrong" response client-side.

**Authorization failures** — `requireEventAccess()`/`requireRole()` failures are a distinct `FORBIDDEN` error code so the UI can show "you don't have access" without leaking *why* — an unauthorized caller sees the same response whether an item doesn't exist or they just can't see it.

**Checkout/scan flow** (highest-pressure UI — errors need to be unambiguous at a glance):
- Unknown barcode/fallback code → inline "code not recognized," input stays focused for immediate retry.
- Already-sold item scanned again → distinct "already sold at HH:MM by X" message (not the same as "unknown code").
- Network/server failure mid-confirm → the confirm popup offers retry rather than silently closing, so a sale isn't lost if staff assume it went through.

**Import flow** — parse errors collected per-row and shown as a table (row, field, problem) before any commit; a failed import never partially writes — all-or-nothing per batch.

**SSE stream** — client auto-reconnects with backoff on disconnect (Wi-Fi drop at a physical event is realistic); on reconnect it re-fetches current state once via a normal request rather than trusting it didn't miss events.

**Logging** — server-side errors logged with context (user id, action, event id) but never with request bodies wholesale, to avoid accidentally logging passwords/IBAN caught up in a payload.

## Section 6: Testing strategy

**Unit tests** (Vitest) — targets the service layer (`lib/services/`): commission calculation, cutoff-date enforcement, barcode-lookup logic, and authorization decisions (`requireEventAccess()` for every role × action combination). Run against a mocked Prisma client — fast, run on every save.

**Integration tests** (Vitest against a real test database) — Server Actions exercised against an actual Postgres instance (disposable test DB, reset between test files), specifically to catch DB-level guarantees: the atomic `LISTED → SOLD` transition preventing double-sells under concurrent calls, unique constraints on `barcodeValue`/`email` holding, correct behavior of the PII-deletion path.

**Authorization boundary tests** — a dedicated matrix suite: for each role (Seller/Staff/Admin/unauthenticated) × each action (edit item, view another seller's items, change commission rate, view audit log, edit item after cutoff), assert allow or deny. Highest-value suite given the security priority — encodes the Section 2 permission mapping directly and catches "forgot to check permissions" regressions as the app grows.

**End-to-end tests** (Playwright) — a small set of critical-path tests: the checkout scan-and-confirm flow (including Enter-key-only interaction and the "already sold" error), the CSV import preview-then-commit flow, and price-tag PDF download. Not exhaustive UI coverage — just the flows where a regression would block someone at a live event.

**Explicitly not tested heavily for MVP:** visual/pixel regression, load/performance testing (flea-market scale is dozens of concurrent users, not thousands).

**CI:** GitHub Actions, running on every push. Unit + integration + authorization suite block merges; Playwright E2E can run on a schedule or pre-release if it proves slow in CI.

## Future work (post-MVP, explicitly out of scope for now)

- Camera-based barcode scanning (v1 ships keyboard-wedge/HID scanner support only).
- Live Google Sheets API integration (v1 uses CSV/XLSX file upload/export instead).
- Real payment/payout integration, e.g. Stripe Connect (v1 stores IBAN/cash preference as reference data only).
- Multi-tenant support for multiple independent organizers (v1 is single-organizer).
- Transactional email (invites, notifications) — v1 relies on the admin manually sharing invite links.
- Breached-password checking (HaveIBeenPwned API) and 2FA.
- Global (non-per-event) role assignment, if it turns out per-event scoping is more flexibility than actually needed.
