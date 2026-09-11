# Next steps — Myyntijärjestelmä

**Status as of writing:** the MVP is complete and merged, and a substantial round of post-MVP work has since shipped: admin/owner bootstrap, home-page and post-login routing, series/bundle bulk item entry, a full UI design pass, and a Signal/Terminal dark-theme retheme. See "Done since MVP" below for what shipped and when. This file tracks what's still needed before a real, deployed, "give it to actual sellers" launch.

## Open

1. **No error/monitoring visibility once deployed**
   - Nothing currently surfaces runtime errors (a failed sale, a broken PDF render, an SSE disconnect) beyond server logs.
   - Decided approach (spec written and approved: `docs/superpowers/specs/2026-09-06-error-monitoring-design.md`, not yet implemented): `@sentry/nextjs`, free tier, email-on-new-issue alerting, error-only (no performance tracing). Needs a manual try/catch added to the SSE polling loop (`app/api/sse/[eventId]/route.ts`) since that runs detached from Next's automatic request-error instrumentation.

2. **No in-app notification when new changes are published**
   - Sellers/staff have no way to learn about new features or fixes after a deploy — everything ships silently, and someone would need to be told out-of-band (or notice on their own) that anything changed.
   - Wanted: a lightweight "what's new" notification (banner, toast, or small unread-dot on a release-notes page) shown to a user the next time they log in after a new release, based on release notes authored somewhere (a changelog file? tied to git tags?) and "seen" state tracked per user.
   - Not yet brainstormed: authoring format/workflow for the notes themselves, where per-user "last seen" state lives (a `User` column? separate table?), and whether this should be its own dismissible banner vs. a dedicated `/whats-new` page.

3. **No language switching — Phase 1 shipped, Phases 2/3 remain**
   - Phase 1 (infrastructure, `User.locale` persistence, the flag toggle — now flag-only with a hover tooltip/`aria-label`, `8f4ad24` — and translated `/login` + event-home nav) is done — see `docs/superpowers/specs/2026-09-10-i18n-language-switching-design.md` and `docs/superpowers/plans/2026-09-11-i18n-phase1.md`.
   - Login page's static labels are translated, but its **error messages are not**: `actions/auth.ts`'s `login`/`acceptInvite`/`signupOwner` return hardcoded English strings (`"Incorrect email or password"`, `"Too many login attempts. Please try again in a minute."`, Zod validation messages) that render as-is regardless of locale. Worth folding into Phase 2 rather than treating as done.
   - Verified untranslated, confirmed 2026-09-11 (Phase 2 scope): the "New event" button (`app/(dashboard)/events/page.tsx`, `.../events/new/CreateEventForm.tsx`); `UpdateCommissionForm.tsx`'s "Commission rate (0–1)" label and "Update" button on the event home page; the entire items page (`items/page.tsx`'s title/column headers, `ItemRow.tsx`'s status badges/"Price tag" link/edit-mode labels, `DeleteItemButton.tsx`'s "Delete"/"Deleting…", `AddItemForm.tsx`/`AddSeriesForm.tsx`'s add-item forms).
   - Phase 3 scope, confirmed 2026-09-11: the `?? 'Unknown'` seller-alias fallback is hardcoded English in three places — `lib/services/price-tags.tsx:73` (printed on the actual price tag), `lib/services/sales.ts:38` (checkout scan display), `lib/services/sales-dashboard.ts:27,41` (sales dashboard). All three should move to the same fallback-translation mechanism together, not just the PDF one, since they're the same string in spirit.
   - Remaining: Phase 2 (every other page/form/validation message, including the login-error-message gap above) and Phase 3 (price-tag PDF text, including the `Unknown` fallback), each to get its own implementation plan when picked up.

4. **Price tags download immediately instead of showing a preview first**
   - Clicking "Price tag" (single item) or "Print all price tags" (list) on the items page immediately triggers a PDF download — there's no way to see what it looks like before committing to printing it.
   - Wanted: some kind of preview (inline PDF viewer, or a rendered-in-browser preview page) before the download happens, for both the single-item and the full-list case.
   - Not yet brainstormed: whether to render the same `@react-pdf/renderer` PDF into an `<iframe>`/`<embed>` for preview then let the user explicitly click "Download", or build a separate lightweight HTML preview that doesn't require generating the actual PDF just to look at it.

6. **E2E suite is intermittently flaky in CI, root cause is running against `next dev`, not a production build**
   - `playwright.config.ts`'s `webServer.command` is `npm run dev`. Next.js dev-mode compiles routes on demand and can trigger a Fast Refresh remount mid-navigation — this is the mechanism behind the `page.goto`/click-swallowing gotchas already documented above in this repo's `CLAUDE.md`. Investigated 2026-09-09: this isn't limited to first-visit-of-a-route: a cold dev server (exactly what every CI run starts with) can hit this at multiple, different navigation points within the same test run, not just once. Confirmed via repeated cold-start trials and Playwright trace network logs — one failure showed the test's `page.goto('/events')` aborted (`net::ERR_ABORTED`) within ~30ms of a preceding `POST` completing, consistent with a client-side navigation racing the hard navigation.
   - Two low-risk, partial mitigations landed 2026-09-09 (see the `manual-sale` branch): `retries: process.env.CI ? 2 : 0` in `playwright.config.ts` (standard Playwright-template default, previously absent), and an extra `page.waitForLoadState('networkidle')` in `events.spec.ts` at one more of the affected call sites. Neither fully eliminates the class of failure — retries didn't save a fresh cold-start run in testing (failed 3/3 attempts in one trial), since the race can recur on the retry's own fresh navigation too.
   - **The actual fix** is running e2e against a production build (`next build && next start`) instead of `next dev` — this removes on-demand compilation/Fast-Refresh entirely, which is the root cause. Attempted and reverted 2026-09-09: switching `webServer.command` surfaces a separate, real issue — Auth.js rejects `http://localhost:3000` under `NODE_ENV=production` with `UntrustedHost`, requiring `trustHost`/`AUTH_TRUST_HOST` configuration. That's a security-relevant Auth.js setting (it governs Host-header trust) that deserves its own deliberate review, not a same-session fix bundled into an unrelated feature branch. Needs: confirm what `trustHost` actually changes in Auth.js's request validation, decide whether it's test-only (e.g. only set when `PLAYWRIGHT`/`CI` env var is present) or would also need to be true in the real Vercel deployment, then update `playwright.config.ts`'s `webServer.command` to `npm run build && npm run start` and `ci.yml` to build before the e2e step.

## Deliberately deferred

- **`PII_ENCRYPTION_KEY` rotation.** Generation, storage, and backup are documented in `docs/deployment.md` (generate once with `openssl rand -base64 32`, store as a Vercel env var, back up in a password manager). Rotation itself (re-encrypting existing IBAN rows under a new key) is not built — deliberately deferred as YAGNI for a single-environment deploy. Build it only if the key is ever actually compromised.

## Noted, not urgent

- **Upstash instance strategy.** CI and production currently share one free-tier Upstash Redis database — a deliberate, reasonable call given the free tier's one-database limit. Worth revisiting only if usage ever grows enough that a CI run's test traffic could meaningfully compete with real checkout-day rate-limit budget.

## Done since MVP

- **STAFF can view/print price tags for any seller's item.** `lib/services/price-tags.tsx`'s `generatePriceTagData` was gating on `requireEventAccess(session, eventId, ['SELLER', 'ADMIN'])`, missing `'STAFF'` — same class of bug as the "My items" fix below. Fixed by adding `'STAFF'` to the allowed roles and treating STAFF as a manager for the own-items-only restriction (they already see every item via `listAllItemsForEvent`/checkout, so this just extends that existing visibility to price tags).
- **UX improvement backlog** — back arrow in the dashboard header (browser-history-style, `components/BackButton.tsx`); item category list swapped to `Pelit`/`Figuurit`/`Mangat`/`Pehmolelut`/`Oheistuotteet`/`Cosplay` (dropping `Elektroniikka`/`Kodintavarat`); multi-day events via a nullable `Event.eventEndDate` column and a "Multiple days" checkbox on event creation; show/hide toggle on all password fields (`components/ui/password-input.tsx`); tactile press feedback on every button plus a pending "Deleting…" state on the item delete button.
- **Deployment runbook** — `docs/deployment.md` covers Vercel setup, Postgres (Neon) provisioning, all required env vars, wiring `prisma migrate deploy` into the build (`package.json`'s `build` script), first-time `/signup` bootstrap, and a post-deploy smoke check.
- **Admin/owner bootstrap** — `/signup` route, zero-user gated, `bootstrapOwner()` re-checks under a Serializable transaction to prevent a race between concurrent first-visitors. (`fb8d402`)
- **Login as the app's starting page** — `/` redirects to `/login` or `/events`. (`6a7e5bb`)
- **Post-login landing depends on role and state** — an owner with zero events lands on event creation; everyone else lands on the events list. (`fa14f37`)
- **Series and bundle bulk item entry** — a mode toggle on the bulk-entry form creates either N items from a volume range (series) or one lot item (bundle). (`c103560`)
- **UI design pass** — dark theme applied across every page (`f032c76` … `6e78edb`), followed by a full Signal/Terminal retheme (palette, Sora/JetBrains Mono, mono treatment on headers/badges/tables, responsive layout fixes). (`f5b2645` … `74d810d`)
- **`CLAUDE.md` and `README.md` rewritten** for the real stack, architecture, and dev commands. (`211974d`)
