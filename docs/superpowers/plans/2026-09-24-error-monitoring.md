# Error/Monitoring Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sentry error monitoring (`@sentry/nextjs`) so runtime failures — a failed sale, a broken PDF render, a dead SSE poll — surface as an email alert instead of silently sitting in server logs.

**Architecture:** Manually add the four Sentry instrumentation files (`instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`) and wrap `next.config.ts` with `withSentryConfig`, rather than running the interactive `npx @sentry/wizard` (which can't be driven non-interactively). This gives Next.js's automatic `onRequestError` instrumentation for Server Actions, Route Handlers, and component render errors for free. The one gap automatic instrumentation can't reach is the SSE route's detached `setInterval` poll loop, which gets an explicit `try/catch` + `Sentry.captureException`.

**Tech Stack:** `@sentry/nextjs` (error-only: `tracesSampleRate: 0`, no session replay), Vercel env vars, Sentry free Developer tier (email-on-new-issue alerting).

**Spec:** `docs/superpowers/specs/2026-09-06-error-monitoring-design.md`

## Global Constraints

- `tracesSampleRate: 0` in every `Sentry.init()` call (server, edge, client config) — this is error-only monitoring, not APM.
- No session replay or feedback integrations — keep the SDK surface minimal.
- Exactly one manual `Sentry.captureException` call in the whole change (the SSE poll tick's `catch` block). Everywhere else, let exceptions propagate to the SDK's automatic instrumentation. Never add code that reports a `Result<T>` `{ ok: false }` value to Sentry — that convention is for expected business-rule/validation failures, not bugs (see `CLAUDE.md`).
- If the Sentry DSN env var is unset (true for every local dev machine and CI today), the SDK must no-op — no thrown errors, no required Sentry account, no build failure.
- `SENTRY_AUTH_TOKEN` (source-map upload) is also expected to be unset locally and in CI — the build must succeed anyway, just without source-map upload.

## Review Focus

- **Missing/empty DSN at runtime** — `npm run dev` and `npm run build` must both succeed with no `NEXT_PUBLIC_SENTRY_DSN` set, matching every current local/CI environment. Covered in Task 2's verification steps.
- **CSP blocking the client SDK's error beacon** — the existing hardened CSP in `middleware.ts` sets `connect-src 'self'`, which would silently swallow every client-side error report to Sentry's ingest domain unless requests stay same-origin. Covered by using `tunnelRoute` in Task 2, with an explicit verification step that no CSP change was needed.
- **`withSentryConfig` breaking the existing `next-intl` plugin wrap** — `next.config.ts` already composes one plugin (`withNextIntl`); adding a second wrapper risks one clobbering the other's config. Covered by a full `npm run build` in Task 2 plus a check that i18n still works.
- **`SENTRY_AUTH_TOKEN` unset failing the build** — `next build` must not fail just because source-map upload has no credentials. Covered in Task 2's verification steps.
- **`stop()` called twice on the SSE stream (poll failure racing a client abort)** — must not throw or double-report to Sentry. Covered by a dedicated test in Task 3.

---

## Task 1: Install `@sentry/nextjs`

**Files:**
- Modify: `package.json` (new dependency)
- Modify: `package-lock.json` (via `npm install`)

**Interfaces:**
- Produces: the `@sentry/nextjs` package (and its `@sentry/nextjs/config` subpath export `withSentryConfig`) available to every later task.

- [ ] **Step 1: Install the package**

Run:
```bash
npm install @sentry/nextjs
```

- [ ] **Step 2: Confirm the installed version exposes the `/config` subpath**

`withSentryConfig` moved from the package root to `@sentry/nextjs/config` as of `@sentry/nextjs@10.73.0` (root export removed entirely in v11). Run:
```bash
node -e "console.log(require('./node_modules/@sentry/nextjs/package.json').version)"
```
Expected: a version `>= 10.73.0`. If it's lower, re-run `npm install @sentry/nextjs@latest`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @sentry/nextjs dependency"
```

---

## Task 2: Wire up Sentry instrumentation (server, edge, client, build config)

**Files:**
- Create: `instrumentation.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Create: `instrumentation-client.ts`
- Modify: `next.config.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `@sentry/nextjs` / `@sentry/nextjs/config` from Task 1.
- Produces: a working `Sentry.captureException` import surface (`import * as Sentry from '@sentry/nextjs'`) that Task 3's SSE fix uses; `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` as the env var names every later reference (docs, `.env.example`) must match exactly.

- [ ] **Step 1: Create `instrumentation.ts`**

```ts
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
```

- [ ] **Step 2: Create `sentry.server.config.ts`**

```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
})
```

- [ ] **Step 3: Create `sentry.edge.config.ts`**

```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
})
```

- [ ] **Step 4: Create `instrumentation-client.ts`**

```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
})
```

Note: all three `Sentry.init()` calls read the same `NEXT_PUBLIC_SENTRY_DSN` variable rather than splitting a public client DSN from a private server one. A Sentry DSN is a write-only ingestion key, not a secret (this is Sentry's own documented position — it's designed to be embedded in client bundles), so there's no confidentiality downside, and one variable is one less thing to keep in sync across three config files and every deploy target.

- [ ] **Step 5: Wrap `next.config.ts` with `withSentryConfig`**

Read the current file first — it already composes `withNextIntl`. Modify it to:

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs/config';

const nextConfig: NextConfig = {
  // @node-rs/argon2 is a native N-API module; letting webpack bundle it
  // corrupts its named exports (hash/verify/Algorithm resolve to undefined
  // at runtime). Marking it external forces a plain require() instead.
  serverExternalPackages: ['@node-rs/argon2'],
};

const withNextIntl = createNextIntlPlugin();

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // Routes client-side error reports through this same-origin path instead
  // of Sentry's ingest domain directly, so middleware.ts's `connect-src
  // 'self'` CSP doesn't need loosening for third-party error reporting.
  tunnelRoute: '/monitoring',
});
```

- [ ] **Step 6: Add the new env vars to `.env.example`**

Add after the existing `PII_ENCRYPTION_KEY` line:

```
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_AUTH_TOKEN=""
SENTRY_ORG=""
SENTRY_PROJECT=""
```

- [ ] **Step 7: Verify the build succeeds with every Sentry var unset**

Run:
```bash
npm run build
```
Expected: succeeds (exit 0), same as before this change. Confirm the output contains no fatal error about a missing DSN, org, project, or auth token — a warning that source maps were skipped (due to no `SENTRY_AUTH_TOKEN`) is expected and fine.

This is the direct verification for the "missing DSN", "missing auth token", and "next-intl plugin composition" Review Focus items — if any of the three broke the build, this step catches it. Clean up the `.next/` build output afterward if it wasn't already gitignored (check `.gitignore` — it should already exclude `.next/`).

- [ ] **Step 8: Verify dev mode is silent with no DSN configured**

Run `npm run dev`, visit `http://localhost:3000/login` in a browser, open the browser devtools console and network tab. Expected: no Sentry-related warnings or errors in the console, and no network requests to `/monitoring` or any `sentry.io` host (the client SDK no-ops with an empty DSN). Stop the dev server after confirming.

- [ ] **Step 9: Commit**

```bash
git add instrumentation.ts sentry.server.config.ts sentry.edge.config.ts instrumentation-client.ts next.config.ts .env.example
git commit -m "feat: wire up Sentry error monitoring instrumentation"
```

---

## Task 3: Fix the SSE poll loop's silent-hang gap

**Files:**
- Modify: `app/api/sse/[eventId]/route.ts`
- Create: `tests/unit/sse-route.test.ts`

**Interfaces:**
- Consumes: `Sentry.captureException` from `@sentry/nextjs` (Task 2); `getSalesSnapshot` from `lib/services/sales-dashboard.ts` (existing, returns `Promise<Result<SalesSnapshot>>` where `SalesSnapshot = { items: SalesSnapshotItem[]; totalRevenue: string; commissionOwed: string }`); `auth` from `lib/auth.ts` (existing).
- Produces: no new exports — this task changes only the `GET` route handler's internal failure-path behavior.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/sse-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/services/sales-dashboard', () => ({ getSalesSnapshot: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const okSnapshot = { ok: true, data: { items: [], totalRevenue: '0', commissionOwed: '0' } } as const

describe('GET /api/sse/[eventId]', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('captures the exception and closes the stream when a poll tick throws', async () => {
    const { GET } = await import('@/app/api/sse/[eventId]/route')
    const { auth } = await import('@/lib/auth')
    const { getSalesSnapshot } = await import('@/lib/services/sales-dashboard')
    const Sentry = await import('@sentry/nextjs')

    vi.mocked(auth).mockResolvedValue({ user: { id: 'staff-1' } } as any)
    vi.mocked(getSalesSnapshot)
      .mockResolvedValueOnce(okSnapshot as any)
      .mockRejectedValueOnce(new Error('db down'))

    const request = new NextRequest('http://localhost/api/sse/evt-1')
    const response = await GET(request, { params: Promise.resolve({ eventId: 'evt-1' }) })
    const reader = response.body!.getReader()

    await reader.read() // consume the initial snapshot chunk sent before the interval starts

    await vi.advanceTimersByTimeAsync(2000)

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error))

    const { done } = await reader.read()
    expect(done).toBe(true)
  })

  it('does not double-report or throw when the request aborts after the poll already stopped it', async () => {
    const { GET } = await import('@/app/api/sse/[eventId]/route')
    const { auth } = await import('@/lib/auth')
    const { getSalesSnapshot } = await import('@/lib/services/sales-dashboard')
    const Sentry = await import('@sentry/nextjs')

    vi.mocked(auth).mockResolvedValue({ user: { id: 'staff-1' } } as any)
    vi.mocked(getSalesSnapshot)
      .mockResolvedValueOnce(okSnapshot as any)
      .mockRejectedValueOnce(new Error('db down'))

    const controller = new AbortController()
    const request = new NextRequest('http://localhost/api/sse/evt-1', { signal: controller.signal })
    const response = await GET(request, { params: Promise.resolve({ eventId: 'evt-1' }) })
    const reader = response.body!.getReader()
    await reader.read()

    await vi.advanceTimersByTimeAsync(2000) // poll tick throws, stop() runs once

    controller.abort() // late abort after the stream is already closed; must be a no-op

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    const { done } = await reader.read()
    expect(done).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/sse-route.test.ts`
Expected: both tests FAIL — `Sentry.captureException` is never called because the route has no try/catch yet, so the first test's assertion fails (0 calls, not 1) and the stream never closes on its own within the tick (the `done` assertion also fails).

- [ ] **Step 3: Implement the fix**

In `app/api/sse/[eventId]/route.ts`, add the Sentry import and wrap the interval callback body in try/catch:

```ts
import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { auth } from '@/lib/auth'
import { getSalesSnapshot } from '@/lib/services/sales-dashboard'
```

Replace the `setInterval` block with:

```ts
      const interval = setInterval(async () => {
        // Re-check auth/access on every tick rather than reusing the session
        // captured at connection open, so a mid-connection revocation (e.g. a
        // tokenVersion bump from PII deletion, or an admin removing the
        // caller's EventMembership) cuts the stream within one poll interval
        // instead of only at the next reconnect.
        try {
          const currentSession = await auth()
          const snapshot = await getSalesSnapshot(currentSession, eventId)
          if (snapshot.ok) {
            send(snapshot.data)
          } else {
            stop()
          }
        } catch (err) {
          Sentry.captureException(err)
          stop()
        }
      }, POLL_INTERVAL_MS)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/sse-route.test.ts`
Expected: both PASS.

- [ ] **Step 5: Run the full unit/integration suite to confirm no regression**

Run: `NODE_OPTIONS='--require dotenv/config' npm test`
Expected: all tests PASS (this route previously had zero test coverage, so no existing test exercised this file).

- [ ] **Step 6: Commit**

```bash
git add app/api/sse/[eventId]/route.ts tests/unit/sse-route.test.ts
git commit -m "fix: report SSE poll failures to Sentry and close the stream cleanly"
```

---

## Task 4: Documentation housekeeping

**Files:**
- Modify: `docs/deployment.md`
- Modify: `docs/next-steps.md`

**Interfaces:**
- Consumes: the env var names fixed in Task 2 (`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Add the Sentry env vars to `docs/deployment.md`'s environment-variables table**

In the "3. Environment variables" table (after the `UPSTASH_REDIS_REST_TOKEN` row), add:

```
| `NEXT_PUBLIC_SENTRY_DSN` | From the Sentry project's Settings → Client Keys (DSN) page. |
| `SENTRY_AUTH_TOKEN` | Generate at Sentry → Settings → Auth Tokens (needs `project:releases` scope) — used only at build time for source-map upload. |
| `SENTRY_ORG` | The Sentry organization slug, visible in the Sentry dashboard URL. |
| `SENTRY_PROJECT` | The Sentry project slug, visible in the Sentry dashboard URL. |
```

- [ ] **Step 2: Replace the "No error/monitoring visibility" bullet in `docs/deployment.md`'s "Known follow-ups" section**

Replace:
```
- **No error/monitoring visibility** — nothing currently surfaces a runtime failure (e.g. a failed sale, a broken PDF render) beyond Vercel's function logs. Watch those logs during the first real event.
```
with a new "## 6. Verify error monitoring" section inserted before "## Known follow-ups", and drop the bullet from "Known follow-ups" entirely:

```
## 6. Verify error monitoring

Sentry (`@sentry/nextjs`) is wired up to email-alert on new issues, but it needs one manual smoke check after each fresh deploy since it depends on the live `NEXT_PUBLIC_SENTRY_DSN` actually being set correctly in Vercel:

- [ ] Add a temporary route (e.g. `app/api/debug-throw/route.ts` with a `GET` handler that does `throw new Error('sentry smoke test')`) and deploy it, or trigger any real error path once (e.g. an invalid checkout scan).
- [ ] Confirm the error appears in the Sentry dashboard within a minute or two.
- [ ] Confirm an email alert arrives at the account email.
- [ ] Trigger a client-side error too (e.g. a deliberate throw in a Client Component) and check the browser devtools console: confirm there's no `Content-Security-Policy: connect-src` violation logged — the `tunnelRoute: '/monitoring'` setup should route the report through this app's own origin, not directly to a `sentry.io` host.
- [ ] If a temporary debug route was added, remove it and redeploy.
- [ ] Separately, confirm the SSE fix: temporarily break `DATABASE_URL` (or otherwise force `getSalesSnapshot` to throw) in a local/staging environment, open the sales dashboard, and confirm the connection closes cleanly (no hang) and the error reaches Sentry.
```

- [ ] **Step 3: Update `docs/next-steps.md`**

Change item 1 under "Open" from:
```
1. **No error/monitoring visibility once deployed**
   - Nothing currently surfaces runtime errors (a failed sale, a broken PDF render, an SSE disconnect) beyond server logs.
   - Decided approach (spec written and approved: `docs/superpowers/specs/2026-09-06-error-monitoring-design.md`, not yet implemented): `@sentry/nextjs`, free tier, email-on-new-issue alerting, error-only (no performance tracing). Needs a manual try/catch added to the SSE polling loop (`app/api/sse/[eventId]/route.ts`) since that runs detached from Next's automatic request-error instrumentation.
```
to:
```
1. **No error/monitoring visibility once deployed — implemented, pending live smoke check**
   - `@sentry/nextjs` is wired up (`docs/superpowers/specs/2026-09-06-error-monitoring-design.md`, `docs/superpowers/plans/2026-09-24-error-monitoring.md`): error-only (`tracesSampleRate: 0`, no session replay), free tier, email-on-new-issue alerting. The SSE polling loop's silent-hang gap (`app/api/sse/[eventId]/route.ts`) is fixed with an explicit try/catch reporting to `Sentry.captureException`.
   - Not yet done: creating the actual Sentry project/DSN and running the post-deploy smoke check in `docs/deployment.md`'s "Verify error monitoring" section, against a real Vercel deploy. Move this item to "Done since MVP" once that's completed.
```

Do not move the item to "Done since MVP" yet — that happens only after the real-deploy smoke check, which needs an actual Sentry account and production DSN this implementation session doesn't have.

- [ ] **Step 4: Commit**

```bash
git add docs/deployment.md docs/next-steps.md
git commit -m "docs: document Sentry setup and post-deploy smoke check"
```
