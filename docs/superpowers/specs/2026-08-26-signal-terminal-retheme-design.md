# Signal/Terminal Retheme — Design Spec

Status: **approved, pending implementation plan**
Source: user-directed follow-up to the design-canvas exploration (three dark-professional direction mockups: Signal, Atelier, Terminal — published as a Claude Design canvas artifact during this session). The user picked Signal's layout/typography with Terminal's color palette, plus opted for the fuller implementation (palette + fonts + structural layout) during brainstorming.
Prior spec: [2026-08-25-ui-design-pass-design.md](2026-08-25-ui-design-pass-design.md) (the original dark-theme UI pass this retheme builds on top of — same primitive architecture, same CSS-variable-driven theming)

## Problem

The app's current dark theme (amber accent, near-black slate, Geist font) was a deliberate, approved design from the prior pass, but the user has since seen three alternative directions mocked up on a design canvas and wants a specific hybrid applied to the real app: Signal's minimal-SaaS-dashboard structure and typography (Sora + JetBrains Mono, dense two-column layouts) combined with Terminal's phosphor-green color palette (near-black background, vivid green accent, mint-tinted text).

## Scope decisions (from brainstorming)

- **Palette:** full replace of `app/globals.css`'s color tokens — new background/card/border/text tones (green-tinted near-black family) and a new primary accent (phosphor green, `#34e37a`, Terminal's exact mockup value).
- **Success gets its own hue, not primary's.** In the mockup, "sold" items used the same green as the primary accent. The user chose instead to keep success/sold visually distinct from primary actions — a cooler teal (`#2dd4bf`) for success, keeping the phosphor green exclusively for actions/links/focus. Warning (K-18) becomes a genuine third hue, amber (`#f5a623`), rather than reusing primary as it does today — a incidental improvement, since today primary and warning are literally the same amber.
- **Destructive/error stays the existing red** (`--destructive: #d92222`, `--destructive-text: #f87171`) fixed for contrast in the prior pass's final review — unrelated to this theme swap, not being revisited.
- **Fonts:** Sora replaces Geist Sans app-wide (headings, body, buttons — everywhere `font-sans`/the default body font currently applies). JetBrains Mono replaces Geist Mono, but is applied **selectively through shared primitives**, not page-by-page: `Badge` and `TableHead` (table column headers) render in mono by default, plus the dashboard shell's app name and signed-in user email. This reproduces the mockup's dominant "mono for labels/data, sans for content" signal without touching every page.
- **Scope trim (flagged, approved implicitly by proceeding):** individual inline price text (e.g. `"5 €"` in item/sale lists) stays in the default sans font rather than being individually wrapped in a mono span on every page that displays one. The mockup used mono for prices too, but chasing that into every list item across ~10 files is disproportionate to the visual payoff versus the primitives-based approach above. Revisit only if the user asks for it after seeing the result.
- **Structural layout: two-column, only where a list-plus-form shape already exists.** The items page (`/events/[eventId]/items`) and the members page (`/events/[eventId]/members`) get Signal's two-column restructure — list on the left, stacked form card(s) on the right, separated by a vertical divider — because both already pair a list with a creation form. Every other page (login, signup, invite, profile, checkout, sales, admin, audit, events list, event detail, home) keeps its current single-column structure and gets palette + font changes only.
- **Out of scope:** no new pages, no new components beyond what's needed to carry mono into `Badge`/`TableHead`, no behavioral changes anywhere (same rule as the prior pass — this is a re-theme and, for items/members, a re-layout, never a change to what a page *does*).

## Architecture

**Palette tokens** (`app/globals.css`, replacing the existing `:root` block):

| Token | New value | Notes |
|---|---|---|
| `--background` | `#08090a` | Terminal's mockup background |
| `--card` | `#0e1310` | subtle green-tinted surface, one step up from background |
| `--border` / `--input` | *computed, not `#1c2b20`* | the mockup's own border reads well under ~1.3:1 against card/background — the same failure mode the prior pass's final review caught and fixed. Compute a muted sage/moss green (roughly the `#3d5a4a`–`#4d6b58` range is a reasonable starting point) that clears ≥3:1 against **both** `--card` and `--background`, the same way `--border: #6b7488` was derived last time — a short throwaway contrast-checking script, not eyeballing. |
| `--ring` | `#34e37a` | focus ring, same as primary |
| `--muted` | `#0e1310` | same as card |
| `--muted-foreground` | *computed from `#6b8f7a`* | mockup's dim-label tone; verify ≥4.5:1 against `--background` since it's used for body-adjacent text (e.g. "Signed in as…"), not just large labels — adjust lightness if the literal mockup value falls short |
| `--primary` | `#34e37a` | phosphor green, Terminal's exact accent |
| `--primary-foreground` | `#08090a` | dark text on the green fill — verify ≥4.5:1, likely comfortable given the accent's brightness |
| `--secondary` | `#0e1310` | same as card |
| `--secondary-foreground` | *computed from `#b8ddc4`* | mockup's secondary-text tone (e.g. "Sign out" button text) |
| `--destructive` | `#d92222` | unchanged from the prior pass's fix |
| `--destructive-foreground` | `#fef2f2` | unchanged |
| `--destructive-text` | *recomputed* | was tuned against the *old* card/background blend; must be recomputed against the *new* `--card`/`--background` since the blend it's checked against changed, even though the literal red value may end up unchanged |
| `--success` | `#2dd4bf` | new: cooler teal, distinct from primary — this is the scope decision above |
| `--success-foreground` | *computed, dark* | dark text/fill pairing for badges using this tone |
| `--warning` | `#f5a623` | new: genuine amber, no longer reusing primary |
| `--warning-foreground` | *computed, dark* | |

**Fonts** (`app/layout.tsx`): swap the two `next/font/google` imports from `Geist`/`Geist_Mono` to `Sora`/`JetBrains_Mono`, keeping the same `--font-geist-sans`/`--font-geist-mono` CSS variable names (or rename both consistently to `--font-sans-loaded`/`--font-mono-loaded`-style names if clearer — implementer's call, but the `@theme inline` mapping in `globals.css` must be updated to match whichever name is chosen). No other file needs to know the underlying font family changed, since everything consumes `font-sans`/`font-mono` Tailwind utilities, not the font name directly.

**Primitive changes** (`components/ui/`):
- `badge.tsx`: add `font-mono` (and a small `tracking-wide`/uppercase treatment if it reads better — implementer's visual judgment) to the base `badgeVariants` className, so every existing `<Badge>` usage across the app picks it up with no call-site changes.
- `table.tsx`: add `font-mono` to `TableHead`'s base className (column headers only — `TableCell` body text stays sans).

**Dashboard shell** (`app/(dashboard)/layout.tsx`): wrap the app-name link and the signed-in user's email in a small mono-styled span/class, matching the mockup's header treatment.

**Structural rewrites:**
- `app/(dashboard)/events/[eventId]/items/page.tsx`: restructure into a two-column CSS grid (roughly `1.6fr 1fr`, matching the mockup) — items list as a compact table-like column on the left (keep the existing `Badge`/delete-button/price-tag-link content, just re-laid-out into grid rows with Item/Price/Status/Actions alignment), `AddItemForm` + `AddSeriesForm` stacked in the right column with a vertical divider (`border-left`). **No change to `AddItemForm.tsx`/`AddSeriesForm.tsx` internals** — same fields, same native `<select>`/`<input type="checkbox">` per the prior pass's hard constraint, just placed inside the new right-column container.
- `app/(dashboard)/events/[eventId]/members/page.tsx`: same treatment — member list as a compact left column, `InviteMemberForm` in a right-column card. **No change to `InviteMemberForm.tsx` internals** — the `<select name="role">` stays native, per the same constraint.

## Constraints carried forward from the prior pass (still binding)

These aren't new decisions — they're the prior pass's hard-won constraints, restated because this work touches the same files:
- Category/role `<select>` and the K-18 `<input type="checkbox">` stay native HTML — `items-quickrepeat.spec.ts` and `events.spec.ts` drive them via `page.selectOption()`/`.check()`.
- No confirmation dialogs added to delete actions.
- The checkout confirm step (untouched by this retheme, but sharing the same `Card`-based pattern) must not become a `Dialog`.
- `getByPlaceholder`/`getByText` substring-match — any new text introduced during the items/members restructure must be checked against existing E2E locators the same way `"Price per item"` vs `"Price"` was caught last time.

## Testing

Since the palette and font changes are pure CSS-variable/token substitutions with zero DOM/text changes, they carry **no test risk** on their own — every existing E2E/unit/integration test is expected to keep passing untouched through those changes. The two structural rewrites (items, members pages) are the actual risk surface: same discipline as the prior pass — preserve every visible string, label, placeholder, and native-element requirement exactly; run the relevant E2E specs (`items.spec.ts`, `items-quickrepeat.spec.ts`, `items-series.spec.ts`, `events.spec.ts`) after each rewrite, not just at the end. Full suite (`npm test`, `npm run test:e2e`) plus `npm run build` (checking new fonts/tokens don't break the production build) gate the final task, matching the prior pass's process.

## Housekeeping

Same known environment quirks as the prior pass apply unchanged: `NODE_OPTIONS='--require dotenv/config'` needed for Vitest/Playwright, `tsconfig.json` auto-rewrites on `next dev`/`next build` (harmless, revert before committing), check port 3000 for a stray server before each Playwright run, and the shared Upstash login rate limiter can trip under heavy local E2E re-runs — not a real bug if it does.
