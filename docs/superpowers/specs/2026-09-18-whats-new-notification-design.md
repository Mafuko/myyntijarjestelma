# "What's New" Notification — Design Spec

Status: **approved, pending implementation plan**
Source: `docs/next-steps.md` item 2 ("No in-app notification when new changes are published"), brainstormed and approved in-session on 2026-09-18.

## Problem

Sellers/staff have no way to learn about new features or fixes after a deploy — everything ships silently. Someone has to be told out-of-band, or has to notice a change on their own.

## Scope decisions (from brainstorming)

- **Notes authored as a committed file, not a DB table or git tags.** No git tags exist in this repo today, and adding an admin UI just to write documentation is disproportionate for a single-deployment app. A structured JSON file, edited as part of whatever PR ships the feature it describes, matches this repo's existing docs-as-code habit (specs/plans already live as files under `docs/superpowers/`).
- **Show only the single most recent (visible) entry**, never an accumulated list. A user who hasn't logged in for weeks doesn't need every missed release re-litigated — just "here's the latest," which is also far simpler to build (no scrollable list, no per-entry read/unread state).
- **Presentation: a dismissible banner, shown once after login**, rendered on top of whatever dashboard page the user lands on. No new route, no persistent nav element — the banner IS the notification.
- **Bilingual, matching the rest of the app.** Every entry carries both an English and a Finnish version, resolved via the same `NEXT_LOCALE` mechanism as everything else, now that i18n Phases 1–3 have shipped.
- **Role-scoped, with higher roles inheriting lower roles' notes.** Some notes are only relevant to STAFF or ADMIN (e.g. an audit-log change means nothing to a SELLER). Each entry declares a minimum role; a user sees an entry if their own effective role meets or exceeds it. Ranking, matching the existing `EventRole` enum's own order and `authz.ts`'s synthetic-`'OWNER'` convention: `SELLER < STAFF < ADMIN < OWNER`.
- **"Effective role" is computed per user account, not per event.** Roles are normally scoped per-event (`EventMembership`) — the same person can be SELLER in one event and STAFF in another — but the banner renders in the shared dashboard layout, which isn't tied to a single event (it also wraps `/events`, `/admin`, `/profile`, etc.). A user's effective role for note-filtering purposes is the *highest* role across all their `ACTIVE` memberships, with the global `isOwner` flag always ranking highest — mirroring how `lib/services/events.ts`'s `listEventsForUser` already treats `isOwner` as an implicit top-level role.
- **Out of scope:** editing or authoring notes through any in-app UI; per-note read/unread history beyond "have they seen the single latest visible one"; notifications for anything other than these hand-authored release notes (no automatic changelog generation from commits/PRs).

## Architecture

**Content file.** New `messages/release-notes.json`, alongside the existing `messages/en.json`/`fi.json` (same directory, since it's the same category of bilingual content, but a distinct shape — a dated list, not a flat key/value catalog, so it isn't part of the `next-intl` message catalog itself). Most-recent-first array:
```json
[
  {
    "date": "2026-09-18",
    "minRole": "STAFF",
    "en": "Staff can now undo an accidental sale from the checkout screen.",
    "fi": "Työvoima voi nyt perua vahingossa tehdyn myynnin kassanäytöltä."
  },
  {
    "date": "2026-09-11",
    "en": "The app is now available in Finnish — look for the flag button.",
    "fi": "Sovellus on nyt saatavilla suomeksi — etsi lippupainiketta."
  }
]
```
`minRole` is optional; omitted means `"SELLER"` (visible to everyone). `date` is a plain `YYYY-MM-DD` string — sorts correctly as a string, no timezone handling needed since only relative ordering matters, never a rendered date/time.

**Schema.** Add to `prisma/schema.prisma`'s `User` model:
```prisma
lastSeenReleaseNoteDate String?
```
`null` means "hasn't dismissed anything yet" — deliberately NOT the same as "has seen everything," so a brand-new signup and a long-dormant returning user both get shown the latest entry (matches this feature's whole purpose: surface the newest thing regardless of when the account was created).

**Persistence service.** New `lib/services/release-notes.ts` (keeping `actions/*.ts` free of direct Prisma/filesystem access, per this repo's layering convention):
```ts
type ReleaseNote = { date: string; minRole?: 'SELLER' | 'STAFF' | 'ADMIN'; en: string; fi: string }
const ROLE_RANK = { SELLER: 0, STAFF: 1, ADMIN: 2, OWNER: 3 } as const

async function getEffectiveRole(userId: string): Promise<keyof typeof ROLE_RANK> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isOwner: true } })
  if (user.isOwner) return 'OWNER'

  const memberships = await prisma.eventMembership.findMany({ where: { userId, status: 'ACTIVE' }, select: { role: true } })
  return memberships.reduce<keyof typeof ROLE_RANK>(
    (highest, m) => (ROLE_RANK[m.role] > ROLE_RANK[highest] ? m.role : highest),
    'SELLER'
  )
}

export async function getLatestVisibleReleaseNote(userId: string): Promise<ReleaseNote | null> {
  const notes: ReleaseNote[] = (await import('@/messages/release-notes.json')).default
  const effectiveRole = await getEffectiveRole(userId)
  const visible = notes.filter((n) => ROLE_RANK[n.minRole ?? 'SELLER'] <= ROLE_RANK[effectiveRole])
  const latest = visible[0] ?? null // file is already most-recent-first

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { lastSeenReleaseNoteDate: true } })
  if (latest && latest.date === user.lastSeenReleaseNoteDate) return null
  return latest
}

export async function markReleaseNoteSeen(userId: string, date: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastSeenReleaseNoteDate: date } })
}
```

**Dismiss action.** New `actions/release-notes.ts`, mirroring `actions/locale.ts`'s shape:
```ts
'use server'

export async function dismissReleaseNote(date: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return
  await markReleaseNoteSeen(session.user.id, date)
}
```

**Wiring into the dashboard layout.** `app/(dashboard)/layout.tsx` (already an async Server Component calling `auth()`) fetches the note and renders a small client banner above `{children}`:
```tsx
const note = session?.user?.id ? await getLatestVisibleReleaseNote(session.user.id) : null
const locale = await getLocale()
...
{note && <ReleaseNoteBanner date={note.date} text={locale === 'fi' ? note.fi : note.en} />}
```

**Banner component.** New `components/ReleaseNoteBanner.tsx` (client component, matching `LocaleToggle.tsx`'s pattern): renders the text in an `Alert`, holds local `dismissed` state so the click feels instant, and calls `dismissReleaseNote(date)` in the background (fire-and-forget, no `router.refresh()` needed — the banner just hides itself locally; the server-side check will naturally stay quiet on the next real navigation once the DB write lands).

## Testing

- **Integration** (new `tests/integration/release-notes.test.ts`): `getEffectiveRole`'s three cases (plain SELLER, a STAFF membership beats a SELLER one, `isOwner` beats everything); `getLatestVisibleReleaseNote` returns `null` once the user's `lastSeenReleaseNoteDate` matches the latest *visible* entry (not just the latest entry overall, if a higher one is role-gated); a STAFF-minRole entry is invisible to a SELLER-only user but visible to a STAFF one; `markReleaseNoteSeen` persists the date.
- **E2E** (new `tests/e2e/whats-new.spec.ts`): a freshly-created user sees the banner with the latest visible entry's text after login; dismissing it hides it immediately and it stays hidden on the next page load within the same session; a SELLER-only user does not see a STAFF-`minRole` entry that a STAFF user in the same fixture data does see.
- Not automated: whether the release-note text itself is well-written — that's an authoring/review concern each time an entry is added, not a test's job.

## Housekeeping

- No new environment variables.
- `docs/next-steps.md`: mark item 2 done once implemented, noting the file-based authoring workflow (edit `messages/release-notes.json` as part of the PR shipping the described change) for future contributors.
- `docs/deployment.md`: no changes expected — no new env vars or infra, just a migration for the new `User` column (same pattern as `User.locale`'s migration).
