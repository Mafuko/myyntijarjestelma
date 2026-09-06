# Error/Monitoring Visibility — Design Spec

Status: **approved, pending implementation plan**
Source: `docs/next-steps.md` item ("No error/monitoring visibility once deployed"), brainstormed and approved in-session on 2026-09-06.

## Problem

Nothing currently surfaces a runtime failure — a failed `Sale` write during checkout, a broken price-tag PDF render, an SSE disconnect — beyond server logs. On the day of a real flea-market event, staff have no way to learn something broke except a seller or customer complaining at the table. This needs to become visible in real time, not discovered after the fact.

## Scope decisions (from brainstorming)

- **Priority is real-time visibility during a live event**, not just a post-hoc debugging record — checkout failures are money-critical and need attention within minutes, not next week.
- **Alert channel is email.** Sentry's free Developer tier sends email on new issues by default; no Slack/Discord webhook setup needed for a single-person project.
- **Provider: Sentry (`@sentry/nextjs`)**, chosen over two alternatives considered and rejected:
  - Vercel's own monitoring/alerting requires a paid Pro plan for alert rules; the free tier gives log retention only, no push notifications.
  - A homegrown try/catch-plus-email-API approach was rejected as reinventing issue grouping, dedup, and stack traces for a worse result than a free off-the-shelf tool (YAGNI).
- **Error-only, not APM.** `tracesSampleRate: 0`, no session replay — this is exclusively about catching unhandled exceptions, not performance monitoring. Keeps the setup lean and comfortably inside the free tier's 5,000-errors/month cap.
- **Respect the existing `Result<T>` convention, don't fight it.** Services return `{ ok: false, error }` for expected business-rule/validation failures and only `throw` for genuine bugs/infra failures (see `CLAUDE.md`). Sentry's automatic instrumentation only captures thrown exceptions, so this separation is preserved for free — no manual filtering needed, and no code should be added that manually reports an `ok: false` result to Sentry.
- **Out of scope:** rotation/retention policy for Sentry data, custom error boundaries beyond Next.js's defaults, alerting on anything other than "new issue" (e.g. no volume-spike thresholds), Slack/Discord integration.

## Architecture

**SDK setup.** Add `@sentry/nextjs` via its setup wizard (`npx @sentry/wizard@latest -i nextjs`), which generates:
- `instrumentation.ts` and `instrumentation-client.ts` — hook into Next.js 15's `onRequestError` and client-side error capture.
- `sentry.server.config.ts` / `sentry.edge.config.ts` — server/edge runtime init.
- A wrapped `next.config.ts` (via `withSentryConfig`) for build-time source-map upload, so stack traces in Sentry show real TypeScript source rather than minified output.

Set `tracesSampleRate: 0` in every generated config file and decline/remove session replay integration if the wizard adds it by default.

This covers Server Actions, Route Handlers, and Server/Client Component render errors automatically — no per-callsite code changes needed for the normal request path.

**Manual instrumentation: the SSE polling gap.** [`app/api/sse/[eventId]/route.ts`](../../app/api/sse/%5BeventId%5D/route.ts)'s `setInterval` callback (lines ~36-49) runs detached from any request lifecycle — the `Response` object has already been returned by the time it fires on each tick, so a throw inside it is an unhandled rejection that Next's `onRequestError` hook never sees. Today this callback has no try/catch at all: if `getSalesSnapshot` throws, the interval callback rejects silently, `stop()` is never called, and the SSE connection is left open but dead (no more `send()` calls, no close) instead of either recovering or closing cleanly. Fix, as part of this work:

```ts
const interval = setInterval(async () => {
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

This is the one deliberate manual `Sentry.captureException` call in the whole change — everywhere else, letting exceptions propagate and letting the SDK's automatic instrumentation catch them is correct and sufficient.

**Configuration.** New environment variables:

| Variable | Purpose | Where |
|---|---|---|
| `SENTRY_DSN` (or split `NEXT_PUBLIC_SENTRY_DSN` if the wizard separates client/server DSNs) | Where errors get sent | Vercel env var; also add to `.env.example` (empty value) |
| `SENTRY_AUTH_TOKEN` | Build-time source-map upload | Vercel env var, build-time only |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Identifies the Sentry project for source-map upload | Vercel env var, build-time only |

If `SENTRY_DSN` is unset, the SDK no-ops — local dev needs no Sentry account and produces no noise by default. This must be verified during implementation (it's the SDK's documented default behavior, but confirm rather than assume).

**Alerting.** Use Sentry's default project alert rule ("notify on new issue") targeting the account email — no custom alert rule needed.

## Testing

Sentry itself is a third-party service and isn't something to unit-test. Verification is a manual smoke check, performed once after this is deployed:
1. Add a temporary debug route (or a deliberate throw reachable via a URL) that throws.
2. Hit it, confirm the error appears in the Sentry dashboard and an email alert arrives.
3. Remove the temporary debug route.
4. Separately, verify the SSE fix: force `getSalesSnapshot` to throw locally (e.g. temporarily break the DB connection mid-poll) and confirm the stream closes cleanly (`stop()` runs) instead of hanging, and that the exception reaches Sentry.

This smoke-check procedure belongs in `docs/deployment.md`'s post-deploy checklist once implemented, replacing its current "Known follow-ups" mention of monitoring as not-yet-built.

Existing automated tests (unit/integration/E2E) are not expected to change — this feature adds observability, not behavior, aside from the SSE fix, which changes only failure-path behavior (clean close instead of a silent hang) with no currently-passing test exercising that path.

## Housekeeping

- Update `.env.example` with the new (empty) Sentry variables.
- Update `docs/deployment.md`: add the Sentry env vars to its environment-variables table, and replace its "No error/monitoring visibility" follow-up bullet with a pointer to the smoke-check steps above.
- Update `docs/next-steps.md`: move this item from "Open" to "Done since MVP" once implemented and verified in a real deploy.
