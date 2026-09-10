# Next steps — Myyntijärjestelmä

**Status as of writing:** the MVP is complete and merged, and a substantial round of post-MVP work has since shipped: admin/owner bootstrap, home-page and post-login routing, series/bundle bulk item entry, a full UI design pass, and a Signal/Terminal dark-theme retheme. See "Done since MVP" below for what shipped and when. This file tracks what's still needed before a real, deployed, "give it to actual sellers" launch.

## Open

1. **No error/monitoring visibility once deployed**
   - Nothing currently surfaces runtime errors (a failed sale, a broken PDF render, an SSE disconnect) beyond server logs.
   - Decided approach (design agreed, not yet implemented): `@sentry/nextjs`, free tier, email-on-new-issue alerting, error-only (no performance tracing). Needs a manual try/catch added to the SSE polling loop (`app/api/sse/[eventId]/route.ts`) since that runs detached from Next's automatic request-error instrumentation. Spec to be written to `docs/superpowers/specs/`.

2. **E2E suite is intermittently flaky in CI, root cause is running against `next dev`, not a production build**
   - `playwright.config.ts`'s `webServer.command` is `npm run dev`. Next.js dev-mode compiles routes on demand and can trigger a Fast Refresh remount mid-navigation — this is the mechanism behind the `page.goto`/click-swallowing gotchas already documented above in this repo's `CLAUDE.md`. Investigated 2026-09-09: this isn't limited to first-visit-of-a-route: a cold dev server (exactly what every CI run starts with) can hit this at multiple, different navigation points within the same test run, not just once. Confirmed via repeated cold-start trials and Playwright trace network logs — one failure showed the test's `page.goto('/events')` aborted (`net::ERR_ABORTED`) within ~30ms of a preceding `POST` completing, consistent with a client-side navigation racing the hard navigation.
   - Two low-risk, partial mitigations landed 2026-09-09 (see the `manual-sale` branch): `retries: process.env.CI ? 2 : 0` in `playwright.config.ts` (standard Playwright-template default, previously absent), and an extra `page.waitForLoadState('networkidle')` in `events.spec.ts` at one more of the affected call sites. Neither fully eliminates the class of failure — retries didn't save a fresh cold-start run in testing (failed 3/3 attempts in one trial), since the race can recur on the retry's own fresh navigation too.
   - **The actual fix** is running e2e against a production build (`next build && next start`) instead of `next dev` — this removes on-demand compilation/Fast-Refresh entirely, which is the root cause. Attempted and reverted 2026-09-09: switching `webServer.command` surfaces a separate, real issue — Auth.js rejects `http://localhost:3000` under `NODE_ENV=production` with `UntrustedHost`, requiring `trustHost`/`AUTH_TRUST_HOST` configuration. That's a security-relevant Auth.js setting (it governs Host-header trust) that deserves its own deliberate review, not a same-session fix bundled into an unrelated feature branch. Needs: confirm what `trustHost` actually changes in Auth.js's request validation, decide whether it's test-only (e.g. only set when `PLAYWRIGHT`/`CI` env var is present) or would also need to be true in the real Vercel deployment, then update `playwright.config.ts`'s `webServer.command` to `npm run build && npm run start` and `ci.yml` to build before the e2e step.

## Deliberately deferred

- **`PII_ENCRYPTION_KEY` rotation.** Generation, storage, and backup are documented in `docs/deployment.md` (generate once with `openssl rand -base64 32`, store as a Vercel env var, back up in a password manager). Rotation itself (re-encrypting existing IBAN rows under a new key) is not built — deliberately deferred as YAGNI for a single-environment deploy. Build it only if the key is ever actually compromised.

## Noted, not urgent

- **Upstash instance strategy.** CI and production currently share one free-tier Upstash Redis database — a deliberate, reasonable call given the free tier's one-database limit. Worth revisiting only if usage ever grows enough that a CI run's test traffic could meaningfully compete with real checkout-day rate-limit budget.

## Done since MVP

- **UX improvement backlog** — back arrow in the dashboard header (browser-history-style, `components/BackButton.tsx`); item category list swapped to `Pelit`/`Figuurit`/`Mangat`/`Pehmolelut`/`Oheistuotteet`/`Cosplay` (dropping `Elektroniikka`/`Kodintavarat`); multi-day events via a nullable `Event.eventEndDate` column and a "Multiple days" checkbox on event creation; show/hide toggle on all password fields (`components/ui/password-input.tsx`); tactile press feedback on every button plus a pending "Deleting…" state on the item delete button.
- **Deployment runbook** — `docs/deployment.md` covers Vercel setup, Postgres (Neon) provisioning, all required env vars, wiring `prisma migrate deploy` into the build (`package.json`'s `build` script), first-time `/signup` bootstrap, and a post-deploy smoke check.
- **Admin/owner bootstrap** — `/signup` route, zero-user gated, `bootstrapOwner()` re-checks under a Serializable transaction to prevent a race between concurrent first-visitors. (`fb8d402`)
- **Login as the app's starting page** — `/` redirects to `/login` or `/events`. (`6a7e5bb`)
- **Post-login landing depends on role and state** — an owner with zero events lands on event creation; everyone else lands on the events list. (`fa14f37`)
- **Series and bundle bulk item entry** — a mode toggle on the bulk-entry form creates either N items from a volume range (series) or one lot item (bundle). (`c103560`)
- **UI design pass** — dark theme applied across every page (`f032c76` … `6e78edb`), followed by a full Signal/Terminal retheme (palette, Sora/JetBrains Mono, mono treatment on headers/badges/tables, responsive layout fixes). (`f5b2645` … `74d810d`)
- **`CLAUDE.md` and `README.md` rewritten** for the real stack, architecture, and dev commands. (`211974d`)
