# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"Myyntijärjestelmä" (sales system) is a web application replacing a manual Google Sheets-based workflow for organizing flea-market ("pihakirppis") sales events. Source requirements: [Myyntijärjestelmä.pdf](Myyntijärjestelmä.pdf) (Finnish).

Roles: **Myyjä** (Seller) lists/edits/deletes only their own items; **Työvoima** (Staff) sees all sellers' items and runs checkout; **Ylläpitäjä/Owner** (Admin) has full visibility and manages events/members. Roles are scoped per-event (a `EventMembership`), except the single `User.isOwner` flag, which is implicitly admin everywhere.

The MVP is complete and in active post-launch iteration — see `docs/next-steps.md` for what's still open before a real deploy, and `docs/superpowers/specs/` / `docs/superpowers/plans/` for the design specs and implementation plans behind each feature (both the original build and every feature added since).

## Tech stack

Next.js 15 (App Router) + TypeScript, React 19, Tailwind v4. Postgres via Prisma ORM (`@prisma/adapter-pg`). Auth.js (NextAuth v5) with a Credentials provider, JWT sessions, argon2id password hashing. Upstash Redis for rate limiting. `@react-pdf/renderer` + `bwip-js` for price-tag PDFs with embedded barcodes. Vitest (unit/integration) + Playwright (E2E).

## Commands

```bash
npm run dev              # start dev server (localhost:3000)
npm run build             # production build
npm run lint               # eslint
npm test                    # vitest (unit + integration, hits real Postgres)
npm run test:e2e         # playwright (full app, hits real Postgres + dev server)
```

**Local Postgres:** `docker-compose up -d` starts a local Postgres container and creates both `myyntijarjestelma` (dev) and `myyntijarjestelma_test` (test) databases via `scripts/init-db.sql`. Copy `.env.example` to `.env` and fill in real values (`AUTH_SECRET` via `npx auth secret`, `PII_ENCRYPTION_KEY` as a 32-byte base64 key, Upstash REST credentials from an Upstash dashboard). Run `npx prisma migrate deploy` against `DATABASE_URL_TEST` once to set up the test database's schema — `npm test`/`npm run test:e2e` don't do this automatically.

**`npm test` and `npx playwright test` do not auto-load `.env`** the way `next dev`/`next build` do (Vitest/Playwright aren't Next.js processes). Prefix with `NODE_OPTIONS='--require dotenv/config'` when running them directly, e.g. `NODE_OPTIONS='--require dotenv/config' npm test`. (On Windows, the short flag form `-r dotenv/config` fails with "`--r=` is not allowed in NODE_OPTIONS" — always use the long form `--require`.)

## Architecture

**Layering:** `app/` (routes/pages, mostly Server Components) → `actions/` (Server Actions, form-data parsing) → `lib/services/` (business logic, authorization, the actual unit of testing) → Prisma. Authorization guards (`requireOwner()` / `requireEventAccess()`, in `lib/services/authz.ts`) live at the service layer so every mutation path goes through the same check, not scattered inline `if`s. Services return a `Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }` — never throw for expected failure cases (validation, authorization, business rules); throwing is reserved for genuine bugs/infra failures.

**Auth:** `lib/auth.ts` (full config, Node-only — Prisma adapter, argon2) vs `lib/auth.config.ts` (Edge-safe subset used by `middleware.ts`, which only checks that a session cookie decodes; it cannot reach the database on the Edge runtime). The authoritative session check — including revocation via `User.tokenVersion`, re-validated against the database on every `auth()` call — happens in `lib/auth.ts`'s `jwt` callback, so pages under `(dashboard)` must call `auth()` themselves and redirect if `!session?.user`, not rely on middleware alone.

**Real-time sales:** `app/api/sse/[eventId]/route.ts` polls Postgres for the caller's scoped sales snapshot every ~2s and pushes full current state each tick (not an in-process event emitter — Vercel serverless instances aren't guaranteed to be the same process across requests). A reconnect after a dropped connection naturally re-syncs since there's no delta state to miss.

**Item creation paths:** single item (`AddItemForm`, quick-repeat: category/K-18 stay sticky across submissions), bulk series/bundle (`AddSeriesForm` — a volume range becomes N items named "`{base} Vol. {n}`", or one bundle item named "`{base} Vol. {start}–{end}`"), and CSV/XLSX import (preview-then-commit, `lib/services/imports.ts`).

**UI:** Tailwind v4, CSS-variable-driven dark-only theme (`app/globals.css`). Hand-authored shadcn/ui-pattern primitives in `components/ui/` — deliberately minimal (only the variants actually used anywhere are defined; don't "complete" a variant set speculatively). Category/role `<select>` elements and the K-18 `<input type="checkbox">` are plain native HTML, not component-wrapped — several E2E tests drive them via `page.selectOption()`/`.check()`, which only work against real native elements. The checkout confirm step (`CheckoutScanner.tsx`) must never become a modal `Dialog` — it depends on focus never leaving the code input across two Enter presses.

**Data model:** see `prisma/schema.prisma`. Key entities: `User` (global identity + `isOwner`), `Event`, `EventMembership` (per-event role: `SELLER`/`STAFF`/`ADMIN`, status `PENDING`/`ACTIVE`/`REMOVED`), `Category`, `Item` (status `LISTED`/`SOLD`/`REMOVED`, nullable `barcodeValue` assigned on price-tag generation), `Sale`, `AuditLog`.

## Known environment gotchas

- **`tsconfig.json` gets auto-rewritten by Next.js** on every `next dev`/`next build` run (`jsx: react-jsx` → `preserve`, plus array reformatting). Harmless — Next.js manages the actual JSX transform via SWC, not `tsc` — but it shows up as working-tree noise; `git checkout -- tsconfig.json` after running dev/build/E2E if you need a clean diff.
- **Playwright's dev-mode first-visit compilation** can race a test's first interaction with a route that hasn't been visited yet in that server process (Next.js dev mode compiles routes on demand, and the resulting Fast Refresh can swallow a click mid-remount). If a new route's E2E test is flaky specifically on its first hit, add `await page.waitForLoadState('networkidle')` after navigating, before interacting.
- **Check for a stray server on port 3000** before running Playwright locally (`netstat -ano | grep :3000`, only `TIME_WAIT` is fine) — `reuseExistingServer: true` locally means Playwright will silently reuse a leftover server pointed at the wrong database if one's still listening.
- **Upstash Redis rate limiting is shared** across dev/CI/production on the free tier (one database). Heavy local E2E test runs (many logins in a short window) can trip the same login rate limiter real users would hit — a "Too many login attempts" failure isn't necessarily a real bug, check whether it's just rate-limit exhaustion from repeated local runs first.
- **`getByPlaceholder`/`getByText` in Playwright do substring matching by default**, not exact — two fields whose placeholders share a substring (e.g. "Price" and "Price per item") will collide across different forms on the same page. Scope with `.locator('form').filter({ has: ... })` or pass `{ exact: true }` rather than picking awkward alternate wording just to dodge the collision.

## Working with this repo

Follow existing conventions: the `Result<T>` pattern, service-layer authorization, TDD (tests are written first — see `tests/unit/`, `tests/integration/`, `tests/e2e/` for the established style per layer). Check `docs/next-steps.md` before starting new work — it tracks what's known to be missing before a real deploy. Non-trivial changes get brainstormed into a short design (bounded) or a written spec + plan under `docs/superpowers/` (architectural) before implementation; see the existing docs there for the expected format.
