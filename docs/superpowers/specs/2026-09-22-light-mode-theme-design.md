# Light Mode Theme Toggle — Design Spec

Status: **approved, pending implementation plan**
Source: `docs/next-steps.md` item 5 ("No light mode — theme is dark-only"), brainstormed and approved in-session on 2026-09-22, including a visual palette comparison the user reviewed as screenshots (remote/mobile session, no direct browser access to the brainstorming companion).

## Problem

The app's Signal/Terminal retheme (`app/globals.css`) is dark-only — one `:root` block of CSS variables, no light variant, no way for a user to switch. Some users will prefer light mode. The app already has a proven pattern for exactly this class of preference: `User.locale`, a per-user, cookie-fronted, DB-persisted setting with a small toggle component in the dashboard header and every pre-login page. This feature is that same pattern applied to theme instead of language.

## Scope survey

- **Every component already goes through ~18 semantic CSS variables** (`--background`, `--foreground`, `--card`, `--border`, `--primary`, etc., defined once in `app/globals.css`'s `:root` block and re-exported under `@theme inline` for Tailwind). Confirmed via a repo-wide grep: **zero** hardcoded hex colors, `bg-black`/`bg-white`/`text-white`/`text-black` utility classes, or Tailwind `dark:` variants exist anywhere outside `globals.css` itself. This means the palette swap itself is fully contained to one file — no component-level changes needed anywhere in `app/**`/`components/**`.
- **The `User.locale` precedent** (`prisma/schema.prisma:49`, `actions/locale.ts`, `components/LocaleToggle.tsx`, `i18n/request.ts`, plus the two-line sync in `actions/auth.ts`'s `login`/`logout`) is the mechanism this feature reuses wholesale: a `NEXT_LOCALE`-style cookie is the single source of truth read at request time (cheap, no DB round-trip, no flash), the DB column is the durable per-user record synced to the cookie on login (so a preference survives a new browser/device) and updated on toggle.
- **One real difference from locale**: `:root`'s `color-scheme: dark` is currently a hardcoded, unconditional declaration. It needs to become theme-aware too, so browser-native chrome (scrollbars, date pickers, checkboxes, autofill highlighting) also flips — `next-intl`'s locale switch has no equivalent native-browser surface to worry about.

## Scope decisions

- **Binary toggle (dark/light), no "system" option.** Matches `LocaleToggle`'s exact shape — one button, flips between two explicit values. A third "follow OS preference" state was considered and explicitly rejected for v1: it needs a materially different toggle UI (radio/select instead of a single button) and adds real edge cases (an OS preference changing mid-session) for a want that hasn't been expressed — YAGNI.
- **Default stays dark** — `User.theme` defaults to `'dark'`, matching the existing look for every current user with no migration-time behavior change.
- **Available everywhere, including pre-login** (`/login`, `/signup`, `/(auth)/invite/[token]`) — matches locale's exact scope. The cookie-based mechanism already works for anonymous visitors with zero extra code; someone with light-sensitivity shouldn't be stuck in dark mode just because they haven't logged in yet.
- **Palette: "Paper Terminal"** — chosen from 3 candidates presented as rendered mockup screenshots (a warm off-white background + darkened terminal-green accent, versus a neutral "Cool Light" SaaS-style option and a stronger-tinted "Mint Light" option). Exact values in Architecture below. Closest brand fidelity to the dark theme: same near-black/pale-mint relationship inverted, same signature green accent (darkened just enough for contrast on a light background), not a generic light-mode repaint.
- **`color-scheme` becomes theme-aware**, flipping native browser chrome alongside the CSS-variable-driven app UI.
- **Out of scope**: visual regression/screenshot-diff testing (no such infrastructure exists anywhere in this app yet — a bigger lift than the feature itself, not proportionate here); any redesign of the dark palette itself (unchanged, byte-for-byte).

## Architecture

**Data model.** `prisma/schema.prisma`'s `User` model gains one column, directly beside `locale`:
```prisma
theme          String   @default("dark")
```

**Cookie.** A new `THEME` cookie, same shape as `NEXT_LOCALE` (`path: '/'`, `maxAge: 60 * 60 * 24 * 365`), holding `'dark'` or `'light'`. Read server-side in the root layout (`app/layout.tsx`) and used to set `data-theme="light"` on `<html>` when the cookie's value is `'light'` (omitted — i.e. the dark default — otherwise). Because this happens during Server Component rendering, the correct theme is present in the very first HTML the browser receives — no flash-of-wrong-theme, unlike a `localStorage`-only client-side approach.

**Actions.** New `actions/theme.ts`, mirroring `actions/locale.ts`:
```ts
'use server'
export async function setTheme(theme: string): Promise<void> {
  if (theme !== 'dark' && theme !== 'light') return
  const cookieStore = await cookies()
  cookieStore.set('THEME', theme, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  const session = await auth()
  if (session?.user?.id) await updateUserTheme(session.user.id, theme)
}
```
`lib/services/users.ts` gains `updateUserTheme` and `getUserTheme`, mirroring the existing `updateUserLocale`/`getUserLocale` exactly (same signature shape, same persistence call).

`actions/auth.ts`'s `login` gains the same two-line sync locale already has: if no `THEME` cookie is present yet, read `User.theme` and set the cookie from it. `logout` deletes the `THEME` cookie alongside `NEXT_LOCALE`.

**CSS.** `app/globals.css` gains a second block, `:root[data-theme="light"]`, immediately after the existing dark `:root` block — overriding every variable the dark block defines, plus `color-scheme: light`:
```css
:root[data-theme="light"] {
  color-scheme: light;
  --background: #f4f7f4;
  --foreground: #0f1a13;
  --card: #ffffff;
  --card-foreground: #0f1a13;
  --border: #c3d6c9;
  --input: #c3d6c9;
  --ring: #1a9d51;
  --muted: #e9f0ea;
  --muted-foreground: #4f6b58;
  --primary: #1a9d51;
  --primary-foreground: #f4f7f4;
  --secondary: #e9f0ea;
  --secondary-foreground: #1f3327;
  --destructive: #d92222;
  --destructive-foreground: #fef2f2;
  --destructive-text: #b91c1c;
  --success: #0d9488;
  --success-foreground: #f4f7f4;
  --warning: #b45309;
  --warning-foreground: #f4f7f4;
}
```
The `@theme inline` block and every component are untouched — they already reference these variables by name, not value, so the attribute-driven override is the entire visual mechanism.

**Component.** New `components/ThemeToggle.tsx`, structurally identical to `LocaleToggle.tsx`: a small outline `Button`, `useTransition`, calls `setTheme(next)` then `router.refresh()`. Rendered as a sun/moon glyph pair (☀️/🌙) rather than text — avoids needing a translated label for the visible glyph itself, matching `LocaleToggle`'s flag-emoji approach. Placed directly beside `LocaleToggle` in the dashboard layout header and on every pre-login page that currently renders `LocaleToggle`.

Unlike `LocaleToggle`'s single `switchToOther` key (which works because "other" is unambiguous once scoped to a fixed active locale file), the toggle's `aria-label`/`title` needs two keys, since the target state depends on the *current theme*, not the active locale: `ThemeToggle.switchToLight` / `ThemeToggle.switchToDark`, added to both `messages/en.json` and `messages/fi.json`.

To know the current theme client-side without a second server round-trip or a DOM read prone to hydration mismatches, a small `ThemeProvider` (a plain React Context, new file `components/ThemeProvider.tsx`) wraps `{children}` in `app/layout.tsx` alongside the existing `NextIntlClientProvider`, initialized server-side with the same value already read from the `THEME` cookie for the `data-theme` attribute. `ThemeToggle.tsx` reads it via a `useTheme()` hook exported alongside the provider — the same shape `next-intl`'s own `useLocale()` already provides for locale, just implemented locally since no library covers this for us.

## Testing

- **Unit**: a small test on `setTheme`'s/`updateUserTheme`'s validation (rejects anything other than `'dark'`/`'light'`), mirroring the existing locale-equivalent test's shape.
- **E2E**: one new spot-check mirroring `tests/e2e/locale.spec.ts` — toggling the flag switches the visible theme (assert `document.documentElement` gets/loses `data-theme="light"`) and survives a reload; a user whose stored `theme` is `'light'` lands in light mode on a fresh browser context. Not exhaustive per-page pixel coverage — matches this app's established "spot-check in e2e, exhaustive in unit" calibration already used for locale and the recent error-message translation work.
- No visual regression/screenshot-diff tooling — explicitly out of scope (see Scope decisions).

## Housekeeping

- **Migration**: one new nullable-with-default `String` column on `User` — no backfill needed (`@default("dark")` covers every existing row transparently, same as `locale`'s own migration did).
- No new environment variables.
- Update `docs/next-steps.md`: mark item 5 ("No light mode") done once shipped, matching how item 3 (language switching) was closed out.
- `docs/deployment.md`: no changes expected.
