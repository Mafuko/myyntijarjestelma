# Light Mode Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-togglable light/dark theme (defaulting to dark), built as a direct mirror of the existing `User.locale`/`LocaleToggle` mechanism.

**Architecture:** A new `User.theme` column (`String @default("dark")`) is the durable per-user record. A `THEME` cookie is the request-time source of truth, read server-side in the root layout to set `data-theme="light"` on `<html>` before any HTML reaches the browser (no flash-of-wrong-theme). `app/globals.css` gains a second `:root[data-theme="light"]` block overriding the same ~18 CSS variables every component already uses — no component files need their own styling changes. A small `ThemeProvider`/`useTheme()` context (there's no library equivalent to `next-intl`'s `useLocale()` for this) lets `ThemeToggle.tsx` know the current theme client-side.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma/Postgres, next-intl, Vitest, Playwright — same stack as the whole app.

**Spec:** `docs/superpowers/specs/2026-09-22-light-mode-theme-design.md`

## Global Constraints

- Binary toggle only (dark/light) — no "system" option, no third state anywhere in this plan.
- `User.theme` defaults to `'dark'` — no behavior change for any existing user.
- The palette swap must be 100% contained to `app/globals.css`. If any task finds itself touching a component file's className or inline style to make light mode look right, that's a signal something in the existing dark-only styling wasn't actually going through the shared CSS variables — stop and report it rather than patching around it inline.
- Toggle appears everywhere `LocaleToggle` currently appears, and nowhere else: `/login`'s page and `app/(dashboard)/layout.tsx`. It does **not** appear on `/signup` or `/(auth)/invite/[token]` — `LocaleToggle` isn't on those pages either (verified directly, an earlier draft of the design spec incorrectly claimed otherwise; the spec has since been corrected).
- Every new cookie/DB-column/action/service-function name mirrors its locale equivalent exactly, substituting `theme`/`Theme`/`THEME` for `locale`/`Locale`/`NEXT_LOCALE`, so a reader who already understands the locale mechanism can read this feature's code with zero new concepts.

---

## Task 1: Data layer — `User.theme` column and service functions

**Files:**
- Modify: `prisma/schema.prisma`
- Create: a new Prisma migration (via `npx prisma migrate dev --name add_user_theme` — do not hand-write the migration folder)
- Modify: `lib/services/users.ts`
- Test: `tests/integration/users.test.ts`

**Interfaces:**
- Produces: `updateUserTheme(userId: string, theme: 'dark' | 'light'): Promise<void>` and `getUserTheme(email: string): Promise<'dark' | 'light'>` in `lib/services/users.ts`, exported the same way `updateUserLocale`/`getUserLocale` already are. Task 2 imports both.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Add the `theme` column to the Prisma schema**

In `prisma/schema.prisma`, inside the `User` model, change:
```prisma
  locale         String   @default("en")
  lastSeenReleaseNoteDate String?
```
to:
```prisma
  locale         String   @default("en")
  theme          String   @default("dark")
  lastSeenReleaseNoteDate String?
```

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name add_user_theme`
Expected: a new folder appears under `prisma/migrations/` (timestamp-prefixed, ending `_add_user_theme`) containing a `migration.sql` whose only content is:
```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'dark';
```
If the generated SQL differs from this, stop and report the discrepancy rather than editing it by hand.

- [ ] **Step 3: Write the failing integration tests**

Append to the end of `tests/integration/users.test.ts` (after its final `})` at line 264):
```ts
describe('updateUserTheme / getUserTheme', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('defaults a new user to dark', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Fresh User', email: 'fresh-theme1@example.com', passwordHash: 'x' } })
    const theme = await getUserTheme(user.email)
    expect(theme).toBe('dark')
  })

  it('persists an updated theme and reflects it via getUserTheme', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Fresh User', email: 'fresh-theme2@example.com', passwordHash: 'x' } })
    await updateUserTheme(user.id, 'light')
    const theme = await getUserTheme(user.email)
    expect(theme).toBe('light')
  })

  it('returns dark for an email with no matching user', async () => {
    const theme = await getUserTheme('does-not-exist-theme@example.com')
    expect(theme).toBe('dark')
  })
})
```
Also update this file's existing import line (line 3) from:
```ts
import { inviteUser, activateInvite, deleteUserPii, bootstrapOwner, updateUserLocale, getUserLocale } from '@/lib/services/users'
```
to:
```ts
import { inviteUser, activateInvite, deleteUserPii, bootstrapOwner, updateUserLocale, getUserLocale, updateUserTheme, getUserTheme } from '@/lib/services/users'
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/integration/users.test.ts`
Expected: FAIL — `updateUserTheme`/`getUserTheme` are not exported from `lib/services/users.ts` yet.

- [ ] **Step 5: Implement the service functions**

In `lib/services/users.ts`, immediately after the existing `getUserLocale` function (the one ending `return (user?.locale as 'en' | 'fi') ?? 'en'` / `}`), add:
```ts
export async function updateUserTheme(userId: string, theme: 'dark' | 'light'): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { theme } })
}

export async function getUserTheme(email: string): Promise<'dark' | 'light'> {
  const user = await prisma.user.findUnique({ where: { email }, select: { theme: true } })
  return (user?.theme as 'dark' | 'light') ?? 'dark'
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/integration/users.test.ts`
Expected: PASS, all tests including the 3 new ones.

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all tests pass, 3 more than the pre-task baseline.

- [ ] **Step 8: Commit**

```bash
git checkout -- tsconfig.json
git add prisma/schema.prisma prisma/migrations lib/services/users.ts tests/integration/users.test.ts
git commit -m "feat: add User.theme column and updateUserTheme/getUserTheme"
```

---

## Task 2: `setTheme` server action and login/logout cookie sync

**Files:**
- Create: `actions/theme.ts`
- Modify: `actions/auth.ts`
- Test: Create `tests/unit/actions/theme.test.ts`, modify `tests/unit/actions/auth.test.ts`

**Interfaces:**
- Consumes: Task 1's `updateUserTheme`/`getUserTheme` from `lib/services/users.ts`.
- Produces: `setTheme(theme: string): Promise<void>` in `actions/theme.ts`, exported the same way `setLocale` is from `actions/locale.ts`. Task 3's `ThemeToggle.tsx` imports and calls it.

- [ ] **Step 1: Write the failing unit tests for `setTheme`**

Create `tests/unit/actions/theme.test.ts` (byte-for-byte mirror of `tests/unit/actions/locale.test.ts`, substituting theme for locale):
```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ updateUserTheme: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn() }),
}))

describe('setTheme action', () => {
  it('sets the THEME cookie regardless of session state', async () => {
    const { setTheme } = await import('@/actions/theme')
    const { auth } = await import('@/lib/auth')
    const { cookies } = await import('next/headers')
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    const setCookie = vi.fn()
    vi.mocked(cookies).mockResolvedValueOnce({ set: setCookie, get: vi.fn() } as any)

    await setTheme('light')

    expect(setCookie).toHaveBeenCalledWith('THEME', 'light', expect.objectContaining({ path: '/' }))
  })

  it('also persists the theme to the signed-in user', async () => {
    const { setTheme } = await import('@/actions/theme')
    const { auth } = await import('@/lib/auth')
    const { updateUserTheme } = await import('@/lib/services/users')
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1' } } as any)

    await setTheme('light')

    expect(updateUserTheme).toHaveBeenCalledWith('user-1', 'light')
  })

  it('does not attempt to persist anything when signed out', async () => {
    const { setTheme } = await import('@/actions/theme')
    const { auth } = await import('@/lib/auth')
    const { updateUserTheme } = await import('@/lib/services/users')
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    vi.mocked(updateUserTheme).mockClear()

    await setTheme('dark')

    expect(updateUserTheme).not.toHaveBeenCalled()
  })

  it('rejects a theme value that is not dark or light, without touching the cookie or the database', async () => {
    const { setTheme } = await import('@/actions/theme')
    const { auth } = await import('@/lib/auth')
    const { updateUserTheme } = await import('@/lib/services/users')
    const { cookies } = await import('next/headers')
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1' } } as any)
    vi.mocked(updateUserTheme).mockClear()
    const setCookie = vi.fn()
    vi.mocked(cookies).mockResolvedValueOnce({ set: setCookie, get: vi.fn() } as any)

    await setTheme('blue')

    expect(setCookie).not.toHaveBeenCalled()
    expect(updateUserTheme).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/actions/theme.test.ts`
Expected: FAIL — `@/actions/theme` does not exist yet.

- [ ] **Step 3: Implement `actions/theme.ts`**

Create `actions/theme.ts`:
```ts
'use server'

import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { updateUserTheme } from '@/lib/services/users'

export async function setTheme(theme: string): Promise<void> {
  if (theme !== 'dark' && theme !== 'light') return

  const cookieStore = await cookies()
  cookieStore.set('THEME', theme, { path: '/', maxAge: 60 * 60 * 24 * 365 })

  const session = await auth()
  if (session?.user?.id) {
    await updateUserTheme(session.user.id, theme)
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/actions/theme.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Write the failing login/logout sync tests**

In `tests/unit/actions/auth.test.ts`, change the mock block at the top (lines 7-11) from:
```ts
vi.mock('@/lib/services/users', () => ({
  activateInvite: vi.fn(),
  bootstrapOwner: vi.fn(),
  getUserLocale: vi.fn().mockResolvedValue('en'),
}))
```
to:
```ts
vi.mock('@/lib/services/users', () => ({
  activateInvite: vi.fn(),
  bootstrapOwner: vi.fn(),
  getUserLocale: vi.fn().mockResolvedValue('en'),
  getUserTheme: vi.fn().mockResolvedValue('dark'),
}))
```
(Without this, Step 3 below will make `login()` call an unmocked `getUserTheme` and throw, breaking every existing test in this file whose `cookies()` mock doesn't have a `THEME` entry already set — including the two locale-sync tests at lines 66 and 87, which currently pass with `get: vi.fn()`/`get: vi.fn().mockReturnValue(...)` mocks that return the same value regardless of which cookie name is queried.)

Then, immediately after the existing test `'leaves an already-set NEXT_LOCALE cookie alone...'` (ending at line 107, right before the `'rejects login attempts once rate-limited...'` test), add two new tests:
```ts
  it('hydrates the THEME cookie from the signed-in user\'s stored theme', async () => {
    const { login } = await import('@/actions/auth')
    const { signIn } = await import('@/lib/auth')
    const { getUserTheme } = await import('@/lib/services/users')
    const { cookies } = await import('next/headers')
    vi.mocked(signIn).mockResolvedValueOnce(undefined as never)
    vi.mocked(getUserTheme).mockResolvedValueOnce('light')
    const setCookie = vi.fn()
    vi.mocked(cookies).mockResolvedValueOnce({ set: setCookie, get: vi.fn() } as any)

    const formData = new FormData()
    formData.set('email', 'light-user@example.com')
    formData.set('password', 'correct-horse-battery-staple')

    const result = await login(formData)

    expect(result.ok).toBe(true)
    expect(getUserTheme).toHaveBeenCalledWith('light-user@example.com')
    expect(setCookie).toHaveBeenCalledWith('THEME', 'light', expect.objectContaining({ path: '/' }))
  })

  it('leaves an already-set THEME cookie alone, even if it differs from the user\'s stored theme', async () => {
    const { login } = await import('@/actions/auth')
    const { signIn } = await import('@/lib/auth')
    const { getUserTheme } = await import('@/lib/services/users')
    const { cookies } = await import('next/headers')
    vi.mocked(signIn).mockResolvedValueOnce(undefined as never)
    vi.mocked(getUserTheme).mockClear()
    const setCookie = vi.fn()
    const getCookie = vi.fn().mockReturnValue({ name: 'THEME', value: 'light' })
    vi.mocked(cookies).mockResolvedValueOnce({ set: setCookie, get: getCookie } as any)

    const formData = new FormData()
    formData.set('email', 'already-toggled-theme@example.com')
    formData.set('password', 'correct-horse-battery-staple')

    const result = await login(formData)

    expect(result.ok).toBe(true)
    expect(getUserTheme).not.toHaveBeenCalled()
    expect(setCookie).not.toHaveBeenCalled()
  })
```

- [ ] **Step 6: Run the auth tests to verify the two new ones fail (and confirm the mock fix doesn't break existing ones)**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/actions/auth.test.ts`
Expected: the two new tests FAIL (`login` doesn't touch `THEME` yet); every pre-existing test in this file still PASSES (the mock-block change in Step 5 only adds a new mocked function, it doesn't change any existing test's behavior).

- [ ] **Step 7: Wire the THEME cookie sync into `login`/`logout`**

In `actions/auth.ts`, change the import line (line 6) from:
```ts
import { activateInvite, bootstrapOwner, getUserLocale } from '@/lib/services/users'
```
to:
```ts
import { activateInvite, bootstrapOwner, getUserLocale, getUserTheme } from '@/lib/services/users'
```

Change:
```ts
  try {
    await signIn('credentials', { ...parsed.data, redirect: false })
    const cookieStore = await cookies()
    if (!cookieStore.get('NEXT_LOCALE')) {
      const locale = await getUserLocale(parsed.data.email)
      cookieStore.set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 })
    }
    return { ok: true, data: { redirectTo: '/events' } }
  } catch {
    return { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } }
  }
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('NEXT_LOCALE')
  await signOut({ redirectTo: '/login' })
}
```
to:
```ts
  try {
    await signIn('credentials', { ...parsed.data, redirect: false })
    const cookieStore = await cookies()
    if (!cookieStore.get('NEXT_LOCALE')) {
      const locale = await getUserLocale(parsed.data.email)
      cookieStore.set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 })
    }
    if (!cookieStore.get('THEME')) {
      const theme = await getUserTheme(parsed.data.email)
      cookieStore.set('THEME', theme, { path: '/', maxAge: 60 * 60 * 24 * 365 })
    }
    return { ok: true, data: { redirectTo: '/events' } }
  } catch {
    return { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } }
  }
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('NEXT_LOCALE')
  cookieStore.delete('THEME')
  await signOut({ redirectTo: '/login' })
}
```

- [ ] **Step 8: Run the auth tests to verify they all pass**

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run tests/unit/actions/auth.test.ts`
Expected: PASS, every test in the file including the 2 new ones.

- [ ] **Step 9: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all tests pass, 6 more than Task 1's ending count (4 in `theme.test.ts` + 2 new ones in `auth.test.ts`).

- [ ] **Step 10: Commit**

```bash
git checkout -- tsconfig.json
git add actions/theme.ts actions/auth.ts tests/unit/actions/theme.test.ts tests/unit/actions/auth.test.ts
git commit -m "feat: add setTheme server action, sync THEME cookie on login/logout"
```

---

## Task 3: UI — light palette, theme provider, toggle component, e2e coverage

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`, `app/(dashboard)/layout.tsx`, `app/(auth)/login/page.tsx`, `messages/en.json`, `messages/fi.json`, `docs/next-steps.md`
- Create: `components/ThemeProvider.tsx`, `components/ThemeToggle.tsx`, `tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: Task 2's `setTheme` from `actions/theme.ts`.
- Produces: nothing consumed by any later task — this is the last task in the plan.

- [ ] **Step 1: Add the light palette to `app/globals.css`**

In `app/globals.css`, immediately after the existing dark `:root { ... }` block (right before the `@theme inline { ... }` block), add:
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
Do not change anything else in this file — the existing dark `:root` block, `@theme inline` block, and `body` rule all stay byte-identical.

- [ ] **Step 2: Create `components/ThemeProvider.tsx`**

```tsx
'use client'

import { createContext, useContext, type ReactNode } from 'react'

const ThemeContext = createContext<'dark' | 'light'>('dark')

export function ThemeProvider({ theme, children }: { theme: 'dark' | 'light'; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useTheme(): 'dark' | 'light' {
  return useContext(ThemeContext)
}
```

- [ ] **Step 3: Create `components/ThemeToggle.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { setTheme } from '@/actions/theme'
import { useTheme } from '@/components/ThemeProvider'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const theme = useTheme()
  const t = useTranslations('ThemeToggle')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClick() {
    const next = theme === 'dark' ? 'light' : 'dark'
    startTransition(async () => {
      await setTheme(next)
      router.refresh()
    })
  }

  const label = theme === 'dark' ? t('switchToLight') : t('switchToDark')

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={handleClick}
      title={label}
      aria-label={label}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </Button>
  )
}
```

- [ ] **Step 4: Add the `ThemeToggle` translation keys**

Add to `messages/en.json`, as a new sibling namespace immediately after the existing `"LocaleToggle": { "switchToOther": "Switch to Finnish" },` block:
```json
  "ThemeToggle": {
    "switchToLight": "Switch to light mode",
    "switchToDark": "Switch to dark mode"
  },
```

Add to `messages/fi.json`, in the same position after its `LocaleToggle` block:
```json
  "ThemeToggle": {
    "switchToLight": "Vaihda vaaleaan tilaan",
    "switchToDark": "Vaihda tummaan tilaan"
  },
```

- [ ] **Step 5: Wire the cookie read and `ThemeProvider` into the root layout**

In `app/layout.tsx`, change:
```tsx
import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import "./globals.css";
```
to:
```tsx
import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { cookies } from 'next/headers';
import { ThemeProvider } from '@/components/ThemeProvider';
import "./globals.css";
```

Change:
```tsx
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${sora.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```
to:
```tsx
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const cookieStore = await cookies();
  const theme = cookieStore.get('THEME')?.value === 'light' ? 'light' : 'dark';

  return (
    <html
      lang={locale}
      data-theme={theme === 'light' ? 'light' : undefined}
      className={`${sora.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Add `ThemeToggle` to the dashboard layout**

In `app/(dashboard)/layout.tsx`, change the import line:
```tsx
import { LocaleToggle } from '@/components/LocaleToggle'
```
to:
```tsx
import { LocaleToggle } from '@/components/LocaleToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
```

Change:
```tsx
          <div className="flex min-w-0 items-center gap-4 text-sm">
            <LocaleToggle />
```
to:
```tsx
          <div className="flex min-w-0 items-center gap-4 text-sm">
            <ThemeToggle />
            <LocaleToggle />
```

- [ ] **Step 7: Add `ThemeToggle` to the login page**

In `app/(auth)/login/page.tsx`, change the import line:
```tsx
import { LocaleToggle } from '@/components/LocaleToggle'
```
to:
```tsx
import { LocaleToggle } from '@/components/LocaleToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
```

Change:
```tsx
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{t('title')}</CardTitle>
          <LocaleToggle />
        </CardHeader>
```
to:
```tsx
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{t('title')}</CardTitle>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LocaleToggle />
          </div>
        </CardHeader>
```

- [ ] **Step 8: Write the failing e2e test**

Create `tests/e2e/theme.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('toggling the flag switches the theme and it survives a reload', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: /switch to light mode/i }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: /switch to dark mode/i }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
})

test('a user whose stored theme is light lands in light mode on a fresh browser context', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner-theme@example.com', isOwner: true, passwordHash: await hashPassword('owner-theme-pw1') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const seller = await testPrisma.user.create({
    data: { name: 'Light Seller', email: 'light-seller@example.com', passwordHash: await hashPassword('light-seller-pw1'), theme: 'light' },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'S', status: 'ACTIVE' },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('light-seller@example.com')
  await page.getByLabel('Password', { exact: true }).fill('light-seller-pw1')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})
```

- [ ] **Step 9: Update `docs/next-steps.md`**

Replace item 5's body in the `## Open` section:
```markdown
5. **No light mode — theme is dark-only** — DONE
   - Shipped: a `User.theme` column, a `THEME` cookie, and a `ThemeToggle` component mirror the existing `User.locale`/`LocaleToggle` mechanism exactly (same cookie shape, same login/logout sync, same toggle placement: `/login`'s page and the dashboard layout only). `app/globals.css` gained a second `:root[data-theme="light"]` block ("Paper Terminal" palette) overriding the same ~18 CSS variables every component already uses — no component styling changed. A small local `ThemeProvider`/`useTheme()` context (no library equivalent to `next-intl`'s `useLocale()` exists for this) lets `ThemeToggle.tsx` read the current theme client-side. See `docs/superpowers/specs/2026-09-22-light-mode-theme-design.md`.
```

- [ ] **Step 10: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `NODE_OPTIONS='--require dotenv/config' npx vitest run`
Expected: all tests pass, same count as the end of Task 2 (this task adds no new vitest tests).

Confirm port 3000 is clear, then run: `NODE_OPTIONS='--require dotenv/config' npx playwright test`
Expected: all tests pass except the already-documented pre-existing `events.spec.ts` flake (retry it once before treating it as a regression) — including the 2 new tests in `tests/e2e/theme.spec.ts`.

- [ ] **Step 11: Commit**

```bash
git checkout -- tsconfig.json
git add app/globals.css app/layout.tsx "app/(dashboard)/layout.tsx" "app/(auth)/login/page.tsx" components/ThemeProvider.tsx components/ThemeToggle.tsx messages/en.json messages/fi.json tests/e2e/theme.spec.ts docs/next-steps.md
git commit -m "feat: add light mode theme toggle (palette, provider, UI wiring, e2e coverage)"
```
