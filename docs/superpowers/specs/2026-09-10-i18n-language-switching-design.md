# Language Switching (English/Finnish) — Design Spec

Status: **approved, pending implementation plan (Phase 1)**
Source: `docs/next-steps.md` item ("No language switching — English only, Finnish should be supported too"), brainstormed and approved in-session on 2026-09-10.

## Problem

The app is English-only today. Finnish should be selectable too, via a flag-button toggle, for a Finnish flea-market audience (the product's own name, "Myyntijärjestelmä," and its default item categories are already Finnish — only the UI chrome is English).

## Scope decisions (from brainstorming)

- **Cookie-based locale, no locale-prefixed routes.** `next-intl` configured in its "without i18n routing" mode. Every existing route (`/events`, `/events/[eventId]/checkout`, etc.) stays exactly as it is — no `app/[locale]/` restructuring, no changes to `middleware.ts` routing, `redirect()` calls, or the ~30 existing tests that assert on literal paths. Rejected alternative: locale-prefixed routes (`/en/...`, `/fi/...`) — the conventional next-intl setup, but a large, invasive restructuring with no SEO benefit for an internal tool with a handful of users.
- **Persisted on the `User` record, synced via cookie.** A new `User.locale` column (`String @default("en")`) so a signed-in user's choice follows them across devices/browsers, not just the current cookie. The cookie (`NEXT_LOCALE`) remains the actual per-request source of truth for rendering (works pre-login too, e.g. on `/login`), kept in sync with `User.locale` in both directions: changing the language while signed in writes both; logging in on a device reads the stored `User.locale` and sets the cookie to match.
- **Scope: main UI + price-tag PDFs.** Every button/label/heading/validation message across the app, plus the fixed text on generated price-tag PDFs. Explicitly NOT in scope: translating item names/categories/seller aliases themselves — those are seller-entered domain data (already often Finnish), not UI chrome, and auto-translating someone's own listing would be a different, unwanted feature.
- **Toggle placement: dashboard header (every page) + `/login`.** The `/login` page has no dashboard header/nav, so it needs its own small toggle — everywhere else, one shared control in the persistent header next to sign-out.
- **Translation authoring: Claude drafts Finnish strings, the user reviews.** Implementation includes a first-pass Finnish translation of every string in scope; the user (native speaker, product owner) reviews/corrects before this ships for real users.
- **Phased delivery — this spec covers all three phases at the design level, but only Phase 1 gets a full implementation plan now:**
  - **Phase 1 (infrastructure + proof-of-concept):** `next-intl` setup, `User.locale` migration, cookie↔`User.locale` sync (both directions), the flag toggle wired into the dashboard header and `/login`, and translating `/login` plus the event-home page's nav end-to-end — enough to prove the whole mechanism before mass-applying it.
  - **Phase 2 (shipped):** every remaining page and form (items, checkout — both the Scan and Sell-by-seller tabs, sales dashboard, members, admin, audit, profile, event creation/edit, signup, invite acceptance). Rescoped during Phase 2 planning: server-side/Zod validation messages (`Result<T>`'s `error.code`/`error.message`) are deliberately NOT translated in this phase — doing so would require changing that shared service-layer error convention — and are deferred to a future phase instead.
  - **Phase 3 (separate plan, later):** price-tag PDF text. Scope turns out small: `renderPriceTagsPdf` has almost no fixed chrome — every tag line is seller-entered data (name, price, alias) except one static marker, `K-18`. The tag renders in whichever locale was active for the staff/seller who clicked "generate."
- **Out of scope entirely:** translating seller-entered content (item names, categories, aliases), any language beyond English/Finnish, browser `Accept-Language`-based auto-detection (new/anonymous visitors default to English, matching current behavior, until they toggle).

## Architecture (Phase 1)

**Library.** `next-intl`, "without i18n routing" — no `[locale]` route segment. `i18n/request.ts` resolves the active locale by reading the `NEXT_LOCALE` cookie via `next/headers`'s `cookies()`, defaulting to `'en'` when unset.

**Messages.** `messages/en.json` / `messages/fi.json`, flat keys namespaced by area (e.g. `"login.title"`, `"nav.myItems"`). Root layout (`app/layout.tsx`) wraps children in `NextIntlClientProvider`, fed the resolved locale's messages, so both Server Components (`getTranslations`) and Client Components (`useTranslations`) can translate.

**Schema.** Add to `prisma/schema.prisma`'s `User` model:
```prisma
locale String @default("en")
```
A migration backfills every existing row to `'en'` — matches the app's current all-English state, no behavior change for existing users until they explicitly toggle.

**Persistence service.** New functions in `lib/services/users.ts` (keeping `actions/*.ts` free of direct Prisma access, per this repo's layering convention):
```ts
export async function updateUserLocale(userId: string, locale: 'en' | 'fi'): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { locale } })
}

export async function getUserLocale(email: string): Promise<'en' | 'fi'> {
  const user = await prisma.user.findUnique({ where: { email }, select: { locale: true } })
  return (user?.locale as 'en' | 'fi') ?? 'en'
}
```

**Toggle action.** New `actions/locale.ts`:
```ts
'use server'

export async function setLocale(locale: 'en' | 'fi'): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 })

  const session = await auth()
  if (session?.user?.id) {
    await updateUserLocale(session.user.id, locale)
  }
}
```
Called from a small client component (the flag button), followed by `router.refresh()` so the current page re-renders in the new language without a full reload.

**Login-time hydration.** `actions/auth.ts`'s `login` function, after a successful `signIn`, reads the authenticating user's stored `locale` and sets the cookie to match, so logging in on a different browser/device restores their saved preference rather than leaving that device's prior (or default) cookie in place:
```ts
try {
  await signIn('credentials', { ...parsed.data, redirect: false })
  const locale = await getUserLocale(parsed.data.email)
  const cookieStore = await cookies()
  cookieStore.set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  return { ok: true, data: { redirectTo: '/events' } }
} catch {
  ...
}
```

**Toggle UI.** A small client component, e.g. `components/LocaleToggle.tsx` — two flag buttons (🇬🇧/🇫🇮) or a single click-to-swap control, calling `setLocale` and `router.refresh()`. Rendered in the dashboard header (next to sign-out) and separately on `/login` (which has no shared header).

## Testing (Phase 1)

- **Integration** (new `tests/integration/locale.test.ts`): `updateUserLocale` persists the value; the `login` action's cookie-hydration reads a stored `User.locale` correctly (mock or inspect the cookie jar as the existing action test conventions do).
- **E2E** (new `tests/e2e/locale.spec.ts`): toggling the flag on a dashboard page changes rendered text for the strings translated in Phase 1 and survives a reload; logging in as a user whose stored `locale` is `'fi'` on a fresh browser context lands with Finnish already active (proves the cross-device sync).
- Not automated: whether the Finnish text itself is correct/natural — that's the user's review pass, not a test's job. Exhaustive per-string coverage across every page is Phase 2+'s concern, not Phase 1's.

## Housekeeping

- No new environment variables (cookie + `User` column only, no third-party service).
- Update `docs/next-steps.md`: once Phase 1 ships, note Phase 1 done and Phases 2/3 as the remaining open work under this same item (don't mark the whole item done until Phase 3 ships).
- `docs/deployment.md`: no changes expected — no new env vars or infra.
