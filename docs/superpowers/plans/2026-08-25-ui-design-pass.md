# UI Design Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app a real dark-themed visual design — a small set of shared UI primitives, a top-bar dashboard shell, and a consistent restyle of all 18 existing pages/forms — with zero behavioral change.

**Architecture:** Hand-authored shadcn/ui-pattern primitives (`components/ui/*`) styled via Tailwind v4 CSS variables layered onto the existing `@theme inline` block in `app/globals.css`; a new `app/(dashboard)/layout.tsx` shell wraps every dashboard page; every existing page/form file is edited in place to use the new primitives and palette, preserving all visible text, labels, placeholders, and native form-element semantics that the existing test suite depends on.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4, TypeScript. New deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-label`.

**Spec:** `docs/superpowers/specs/2026-08-25-ui-design-pass-design.md`

## Global Constraints

- Dark theme only — no light theme, no toggle, no `prefers-color-scheme` branching.
- Styling only. No behavioral, routing, or data-shape changes anywhere in this plan.
- No shadcn `Select`, `Checkbox`, `Dialog`, `AlertDialog`, or `Separator` — see spec's "Constraints found while writing the implementation plan" section. Category/role `<select>` and the K-18 `<input type="checkbox">` stay native HTML elements, styled with Tailwind utility classes directly.
- The checkout confirm step (`CheckoutScanner.tsx`) must keep focus in the code `<input>` across lookup and confirm — it is restyled with `Card`, never `Dialog`.
- Delete actions (item delete, "Delete PII") keep their current one-click `<form action>` submit with no added confirmation step.
- Every visible string an E2E/RTL test depends on (button text, labels, placeholders, message text) must be preserved exactly — see each task's "Test-sensitive strings" note.
- `npm test` (Vitest unit/integration) and `npm run test:e2e` (Playwright) must both be green before the plan is considered done (Task 18).

---

## Task 1: Install dependencies and scaffold shadcn/ui-pattern config

**Files:**
- Modify: `package.json`
- Create: `lib/utils.ts`
- Create: `components.json`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` from `lib/utils.ts`, imported by every primitive in Tasks 3–4.

- [ ] **Step 1: Install the new dependencies**

Run:
```
npm install class-variance-authority clsx tailwind-merge @radix-ui/react-label
```

- [ ] **Step 2: Create the `cn` class-merging helper**

Create `lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3: Add `components.json`**

So a future `npx shadcn add <component>` (if ever needed beyond this pass) targets the right paths and CSS-variable convention already in use.

Create `components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

- [ ] **Step 4: Verify the build still succeeds**

Run: `npm run build`
Expected: build succeeds (no runtime usage of `cn` yet, so this just confirms the new file/config didn't break anything).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/utils.ts components.json
git commit -m "chore: add shadcn/ui-pattern deps and cn() helper"
```

---

## Task 2: Dark palette and app metadata

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: Tailwind color utilities `bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `border-border`/`border-input`, `ring-ring`, `bg-muted`, `text-muted-foreground`, `bg-primary`/`text-primary-foreground`, `bg-secondary`/`text-secondary-foreground`, `bg-destructive`/`text-destructive-foreground`, `text-success`/`bg-success`/`text-success-foreground`, `bg-warning`/`text-warning-foreground` — consumed by every primitive in Tasks 3–4 and every page task after.

- [ ] **Step 1: Replace the palette in `app/globals.css`**

```css
@import "tailwindcss";

:root {
  --background: #0b0e14;
  --foreground: #e6e8ec;
  --card: #12161f;
  --card-foreground: #e6e8ec;
  --border: #232838;
  --input: #232838;
  --ring: #f59e0b;
  --muted: #1a1f2b;
  --muted-foreground: #8891a5;
  --primary: #f59e0b;
  --primary-foreground: #0b0e14;
  --secondary: #1a1f2b;
  --secondary-foreground: #e6e8ec;
  --destructive: #dc2626;
  --destructive-foreground: #fef2f2;
  --success: #22c55e;
  --success-foreground: #052e13;
  --warning: #f59e0b;
  --warning-foreground: #1c1206;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
}
```

Note: the `prefers-color-scheme: dark` block is removed entirely (dark is now the only theme), and `body`'s `font-family` now actually uses the loaded Geist font instead of the previous hardcoded `Arial, Helvetica, sans-serif` (which was silently overriding the `font-geist-sans` variable already being loaded in `layout.tsx` — a pre-existing bug this pass corrects since it's directly part of getting typography right).

- [ ] **Step 2: Fix the placeholder metadata in `app/layout.tsx`**

In `app/layout.tsx`, replace:
```ts
export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};
```
with:
```ts
export const metadata: Metadata = {
  title: "Myyntijärjestelmä",
  description: "Myynninhallinta pihakirppis-tapahtumille",
};
```

- [ ] **Step 3: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: apply dark theme palette and fix app metadata"
```

---

## Task 3: Button, Input, Label primitives

**Files:**
- Create: `components/ui/button.tsx`
- Create: `components/ui/input.tsx`
- Create: `components/ui/label.tsx`

**Interfaces:**
- Consumes: `cn` from `lib/utils.ts` (Task 1); palette color utilities from Task 2.
- Produces: `Button` (props: standard `<button>` attributes + `variant?: 'default' | 'destructive' | 'outline'`, `size?: 'default' | 'sm' | 'lg'`), `buttonVariants(...)` (for styling a `<Link>` identically to a `Button`), `Input` (forwards all `<input>` attributes, including `ref`), `Label` (props: standard `<label>` attributes, requires `htmlFor` to associate with an input's `id`) — all consumed by every page task from Task 5 onward.

- [ ] **Step 1: Create `components/ui/button.tsx`**

```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-border bg-transparent text-foreground hover:bg-muted',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
)
Button.displayName = 'Button'
```

- [ ] **Step 2: Create `components/ui/input.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
```

- [ ] **Step 3: Create `components/ui/label.tsx`**

```tsx
'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium text-foreground', className)} {...props} />
))
Label.displayName = 'Label'
```

`LabelPrimitive.Root` renders a real `<label>` element, so `htmlFor`/`id` association works exactly like a plain `<label>` — this is what keeps Playwright's `getByLabel(...)` working across every form task below.

- [ ] **Step 4: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds (components exist but aren't wired into any page yet).

- [ ] **Step 5: Commit**

```bash
git add components/ui/button.tsx components/ui/input.tsx components/ui/label.tsx
git commit -m "feat: add Button, Input, Label UI primitives"
```

---

## Task 4: Card, Table, Badge, Alert primitives

**Files:**
- Create: `components/ui/card.tsx`
- Create: `components/ui/table.tsx`
- Create: `components/ui/badge.tsx`
- Create: `components/ui/alert.tsx`

**Interfaces:**
- Consumes: `cn` from `lib/utils.ts`; palette utilities from Task 2.
- Produces: `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`; `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` (each a thin wrapper over the matching native table element — `TableRow` is a real `<tr>`, needed for Playwright's `getByRole('row', ...)`); `Badge` (props: `variant?: 'secondary' | 'success'`); `Alert`/`AlertDescription` (props: `variant?: 'default' | 'destructive' | 'warning'`) — consumed from Task 8 onward.

- [ ] **Step 1: Create `components/ui/card.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />
  )
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h3 ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
)
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
)
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
)
CardFooter.displayName = 'CardFooter'
```

- [ ] **Step 2: Create `components/ui/table.tsx`**

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
)
Table.displayName = 'Table'

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />
)
TableHeader.displayName = 'TableHeader'

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
)
TableBody.displayName = 'TableBody'

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('border-b border-border transition-colors hover:bg-muted/50', className)} {...props} />
  )
)
TableRow.displayName = 'TableRow'

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-10 px-4 text-left align-middle font-medium text-muted-foreground', className)} {...props} />
  )
)
TableHead.displayName = 'TableHead'

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn('p-4 align-middle text-foreground', className)} {...props} />
)
TableCell.displayName = 'TableCell'
```

- [ ] **Step 3: Create `components/ui/badge.tsx`**

```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const badgeVariants = cva('inline-flex items-center rounded-md border border-transparent px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      secondary: 'bg-secondary text-secondary-foreground',
      success: 'bg-success text-success-foreground',
    },
  },
  defaultVariants: { variant: 'secondary' },
})

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
```

- [ ] **Step 4: Create `components/ui/alert.tsx`**

```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const alertVariants = cva('relative w-full rounded-lg border p-4 text-sm', {
  variants: {
    variant: {
      default: 'border-border bg-card text-card-foreground',
      destructive: 'border-destructive/50 bg-destructive/10 text-destructive',
      warning: 'border-warning/50 bg-warning/10 text-warning',
    },
  },
  defaultVariants: { variant: 'default' },
})

export const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
))
Alert.displayName = 'Alert'

export const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p ref={ref} className={cn('leading-relaxed', className)} {...props} />
)
AlertDescription.displayName = 'AlertDescription'
```

- [ ] **Step 5: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/ui/card.tsx components/ui/table.tsx components/ui/badge.tsx components/ui/alert.tsx
git commit -m "feat: add Card, Table, Badge, Alert UI primitives"
```

---

## Task 5: Dashboard shell (top bar layout) and sign-out wiring

**Files:**
- Create: `app/(dashboard)/layout.tsx`
- Modify: `app/(dashboard)/events/page.tsx` (remove the "Signed in as ..." line — the shell now shows it)

**Interfaces:**
- Consumes: `Button` (Task 3), `auth()` from `lib/auth.ts`, `logout()` from `actions/auth.ts` (already exists, unused until now).
- Produces: every page under `app/(dashboard)/` is now wrapped in a top bar with app name, signed-in user email, and a working sign-out button.

**Test-sensitive strings:** `tests/e2e/auth.spec.ts:43` and `:83` assert `getByText('seller@example.com')` / `getByText('revoke-seller@example.com')` are visible after login — this must still be true once the email moves from the events page body into the shell header (Playwright's `getByText` searches the whole page, not just `<main>`, so this holds).

- [ ] **Step 1: Create `app/(dashboard)/layout.tsx`**

```tsx
import type { ReactNode } from 'react'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { logout } from '@/actions/auth'
import { Button } from '@/components/ui/button'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth()

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-3">
          <Link href="/events" className="font-semibold text-foreground">
            Myyntijärjestelmä
          </Link>
          {session?.user && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{session.user.email}</span>
              <form action={logout}>
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Remove the now-redundant "Signed in as" line from the events page**

In `app/(dashboard)/events/page.tsx`, remove this line from the JSX (keep everything else on the page unchanged for now — it's fully restyled in Task 8):
```tsx
      <p>Signed in as {session.user.email}</p>
```

- [ ] **Step 3: Run the auth E2E spec to confirm the shell renders correctly and sign-out works**

Run: `npx playwright test tests/e2e/auth.spec.ts`
Expected: PASS. This also exercises `getByText('seller@example.com')` now resolving against the shell header instead of the page body.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/layout.tsx" "app/(dashboard)/events/page.tsx"
git commit -m "feat: add dashboard top-bar shell with working sign-out"
```

---

## Task 6: Restyle the home page (`/`)

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `buttonVariants` (Task 3).

No test touches `/` (confirmed: no `goto('/')` anywhere in `tests/e2e`), so this is unconstrained.

- [ ] **Step 1: Replace the `create-next-app` placeholder content**

Replace the full contents of `app/page.tsx`:
```tsx
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Myyntijärjestelmä</h1>
      <p className="max-w-md text-muted-foreground">
        Hallinnoi pihakirppis-tapahtumien myyntiä, hinnastoja ja kassaa yhdessä paikassa.
      </p>
      <Link href="/login" className={buttonVariants({ size: 'lg' })}>
        Log in
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: restyle home page"
```

---

## Task 7: Restyle login and invite pages

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/(auth)/invite/[token]/page.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `Label` (Task 3); `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Alert`, `AlertDescription` (Task 4).

**Test-sensitive strings:** `getByLabel('Email')`, `getByLabel('Password')`, `getByRole('button', { name: /log in/i })`, `getByRole('button', { name: /set password/i })` — used across `auth.spec.ts`, `events.spec.ts`, `checkout.spec.ts`, `import.spec.ts`, `items.spec.ts`, `items-quickrepeat.spec.ts`, `pii-deletion.spec.ts`, `price-tags.spec.ts`, `sales-dashboard.spec.ts`. All button/label text below is kept byte-identical to the original.

- [ ] **Step 1: Restyle `app/(auth)/login/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { login } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await login(formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    window.location.href = result.data.redirectTo
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit">Log in</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Restyle `app/(auth)/invite/[token]/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { acceptInvite } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function InvitePage() {
  const params = useParams<{ token: string }>()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    formData.set('token', params.token)
    const result = await acceptInvite(formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    window.location.href = result.data.redirectTo
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={10} />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit">Set password</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Run the auth E2E spec**

Run: `npx playwright test tests/e2e/auth.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/login/page.tsx" "app/(auth)/invite/[token]/page.tsx"
git commit -m "feat: restyle login and invite pages"
```

---

## Task 8: Restyle events list page and CreateEventForm

**Files:**
- Modify: `app/(dashboard)/events/page.tsx`
- Modify: `app/(dashboard)/events/CreateEventForm.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `Label` (Task 3); `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Alert`, `AlertDescription` (Task 4).

**Test-sensitive strings:** `getByPlaceholder('Event name')`, `getByLabel('Event date')`, `getByLabel('Registration deadline')`, `getByLabel('Item edit cutoff')`, `getByRole('button', { name: /create event/i })`, `getByText('Syyskirppis')` (an event name, must remain the visible text of the `<Link>`) — all from `events.spec.ts`.

- [ ] **Step 1: Restyle `app/(dashboard)/events/page.tsx`**

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { listEventsForUser } from '@/lib/services/events'
import { CreateEventForm } from './CreateEventForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function EventsPage() {
  const session = await auth()
  // middleware.ts only checks that a session cookie decodes (it runs on the
  // Edge runtime, which can't reach the database to check tokenVersion — see
  // lib/auth.config.ts). This is the authoritative check: lib/auth.ts's jwt
  // callback re-validates tokenVersion against the database on every call,
  // so a revoked session (cookie still present, but tokenVersion bumped)
  // lands here as session === null and must be redirected explicitly.
  if (!session?.user) redirect('/login')

  const events = await listEventsForUser(session.user.id)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Events</h1>
        <ul className="mt-4 flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="text-primary underline-offset-4 hover:underline">
                {e.name}
              </Link>{' '}
              <span className="text-muted-foreground">— {e.role}</span>
            </li>
          ))}
        </ul>
      </div>

      {user.isOwner && (
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Create event</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateEventForm />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Restyle `app/(dashboard)/events/CreateEventForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { createEvent } from '@/actions/events'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function CreateEventForm() {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await createEvent(formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <Input name="name" placeholder="Event name" required />
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="eventDate">Event date</Label>
        <Input id="eventDate" name="eventDate" type="date" required />
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="registrationDeadline">Registration deadline</Label>
        <Input id="registrationDeadline" name="registrationDeadline" type="date" required />
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="itemEditCutoffDate">Item edit cutoff</Label>
        <Input id="itemEditCutoffDate" name="itemEditCutoffDate" type="date" required />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit">Create event</Button>
    </form>
  )
}
```

- [ ] **Step 3: Run the events E2E spec**

Run: `npx playwright test tests/e2e/events.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/events/page.tsx" "app/(dashboard)/events/CreateEventForm.tsx"
git commit -m "feat: restyle events list page and create-event form"
```

---

## Task 9: Restyle event detail page and UpdateCommissionForm

**Files:**
- Modify: `app/(dashboard)/events/[eventId]/page.tsx`
- Modify: `app/(dashboard)/events/[eventId]/UpdateCommissionForm.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `Label` (Task 3); `Alert`, `AlertDescription` (Task 4).

**Test-sensitive strings:** `getByRole('link', { name: /members/i })` from `events.spec.ts:30`.

- [ ] **Step 1: Restyle `app/(dashboard)/events/[eventId]/page.tsx`**

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { UpdateCommissionForm } from './UpdateCommissionForm'

export default async function EventHomePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER', 'STAFF', 'ADMIN'])
  if (!authz.ok) redirect('/events')

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  const canManage = authz.role === 'ADMIN' || authz.role === 'OWNER'
  const navLinkClass = 'text-primary underline-offset-4 hover:underline'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">{event.name}</h1>
      <nav className="flex flex-col gap-2">
        <Link href={`/events/${eventId}/items`} className={navLinkClass}>
          My items
        </Link>
        {(authz.role === 'STAFF' || canManage) && (
          <Link href={`/events/${eventId}/checkout`} className={navLinkClass}>
            Checkout
          </Link>
        )}
        <Link href={`/events/${eventId}/sales`} className={navLinkClass}>
          Sales
        </Link>
        {canManage && (
          <Link href={`/events/${eventId}/members`} className={navLinkClass}>
            Members
          </Link>
        )}
      </nav>

      {canManage && <UpdateCommissionForm eventId={eventId} commissionRate={event.commissionRate.toString()} />}
    </div>
  )
}
```

- [ ] **Step 2: Restyle `app/(dashboard)/events/[eventId]/UpdateCommissionForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { updateEvent } from '@/actions/events'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function UpdateCommissionForm({ eventId, commissionRate }: { eventId: string; commissionRate: string }) {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await updateEvent(eventId, formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
  }

  return (
    <form action={handleSubmit} className="flex max-w-xs flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="commissionRate">Commission rate (0–1)</Label>
          <Input id="commissionRate" name="commissionRate" type="number" step="0.01" min="0" max="1" defaultValue={commissionRate} />
        </div>
        <Button type="submit" size="sm">
          Update
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
```

- [ ] **Step 3: Run the events E2E spec**

Run: `npx playwright test tests/e2e/events.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/events/[eventId]/page.tsx" "app/(dashboard)/events/[eventId]/UpdateCommissionForm.tsx"
git commit -m "feat: restyle event detail page and commission form"
```

---

## Task 10: Restyle items list page and AddItemForm

**Files:**
- Modify: `app/(dashboard)/events/[eventId]/items/page.tsx`
- Modify: `app/(dashboard)/events/[eventId]/items/AddItemForm.tsx`

**Interfaces:**
- Consumes: `Button`, `Input` (Task 3); `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Badge`, `Alert`, `AlertDescription` (Task 4); `cn` (Task 1).

**Test-sensitive strings/elements (Global Constraint: native select/checkbox):** `getByPlaceholder('Item name')`, `getByPlaceholder('Price')`, `getByRole('button', { name: /add item/i })`, `getByRole('button', { name: /delete/i })` (`items.spec.ts`); `page.locator('select[name="categoryId"]')` + `.selectOption(...)`, `page.locator('input[name="isAgeRestricted"]')` + `.check()`/`.toBeChecked()` (`items-quickrepeat.spec.ts`) — the `<select name="categoryId">` and `<input type="checkbox" name="isAgeRestricted">` must stay native elements, not swapped for a component.

- [ ] **Step 1: Restyle `app/(dashboard)/events/[eventId]/items/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { listItemsForSeller } from '@/lib/services/items'
import { deleteItem } from '@/actions/items'
import { AddItemForm } from './AddItemForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function ItemsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) redirect('/events')

  const [categories, itemsResult] = await Promise.all([
    prisma.category.findMany({ where: { eventId } }),
    listItemsForSeller(session, eventId),
  ])
  const items = itemsResult.ok ? itemsResult.data : []
  const listedIds = items.filter((i) => i.status === 'LISTED').map((i) => i.id)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">My items</h1>

        {listedIds.length > 0 && (
          <a
            href={`/api/price-tags/${eventId}?itemIds=${listedIds.join(',')}`}
            className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
          >
            Print all price tags
          </a>
        )}

        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <span className="text-foreground">
                {item.name} — {item.price} €
              </span>
              <Badge variant={item.status === 'SOLD' ? 'success' : 'secondary'}>{item.status}</Badge>
              {item.status === 'LISTED' && (
                <form
                  action={async () => {
                    'use server'
                    await deleteItem(item.id, eventId)
                  }}
                >
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              )}
              {item.status === 'LISTED' && (
                <a
                  href={`/api/price-tags/${eventId}?itemIds=${item.id}`}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Price tag
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>

      <AddItemForm eventId={eventId} categories={categories} />
    </div>
  )
}
```

- [ ] **Step 2: Restyle `app/(dashboard)/events/[eventId]/items/AddItemForm.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import { createItem } from '@/actions/items'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

type Category = { id: string; name: string }

export function AddItemForm({ eventId, categories }: { eventId: string; categories: Category[] }) {
  const [error, setError] = useState<string | null>(null)
  // Category and K-18 are kept as controlled state so they persist across
  // submissions (quick-repeat entry) regardless of any browser/React form
  // auto-reset behavior. Name and price are uncontrolled and cleared
  // explicitly after a successful submit.
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [isAgeRestricted, setIsAgeRestricted] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)

  // A plain onSubmit handler (rather than the `action` prop) is used
  // deliberately: React's form-action machinery automatically resets the
  // <form> after a successful action, which forces the checkbox back to
  // unchecked at the DOM level even though it's React-controlled (the
  // native reset bypasses React's reconciliation). That would silently
  // break the quick-repeat behavior below. onSubmit + preventDefault avoids
  // that auto-reset entirely, so the controlled category/K-18 state is the
  // only thing driving what's displayed.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const result = await createItem(eventId, formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
    if (nameRef.current) nameRef.current.value = ''
    if (priceRef.current) priceRef.current.value = ''
  }

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Add an item</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input ref={nameRef} name="name" placeholder="Item name" required />
          <Input ref={priceRef} name="price" type="number" step="0.01" min="0.01" placeholder="Price" required />
          {/* Native <select>, not a Select component — items-quickrepeat.spec.ts
              drives this via page.selectOption('select[name="categoryId"]', ...). */}
          <select
            name="categoryId"
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={cn(
              'h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-foreground">
            {/* Native checkbox, not a Checkbox component — same test drives
                this via page.locator('input[name="isAgeRestricted"]').check(). */}
            <input
              name="isAgeRestricted"
              type="checkbox"
              checked={isAgeRestricted}
              onChange={(e) => setIsAgeRestricted(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            K-18
          </label>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit">Add item</Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Run the items E2E specs**

Run: `npx playwright test tests/e2e/items.spec.ts tests/e2e/items-quickrepeat.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/events/[eventId]/items/page.tsx" "app/(dashboard)/events/[eventId]/items/AddItemForm.tsx"
git commit -m "feat: restyle items list page and add-item form"
```

---

## Task 11: Restyle import page and ImportForm

**Files:**
- Modify: `app/(dashboard)/events/[eventId]/items/import/page.tsx`
- Modify: `app/(dashboard)/events/[eventId]/items/import/ImportForm.tsx`

**Interfaces:**
- Consumes: `Button`, `Input` (Task 3); `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Alert`, `AlertDescription` (Task 4).

**Test-sensitive strings:** `getByRole('button', { name: /^preview$/i })`, `getByRole('button', { name: /confirm import/i })`, `getByText('1 valid row(s) ready to import.')`, `getByText('price')` (a row-error field value), `getByText('Imported 1 item(s).')` — from `import.spec.ts`.

- [ ] **Step 1: Restyle `app/(dashboard)/events/[eventId]/items/import/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { ImportForm } from './ImportForm'

export default async function ImportPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) redirect('/events')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Import items from a spreadsheet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Export your Google Sheet as CSV or XLSX with columns: Tavara, Hinta, Tyyppi, K-18.
        </p>
      </div>
      <ImportForm eventId={eventId} />
    </div>
  )
}
```

- [ ] **Step 2: Restyle `app/(dashboard)/events/[eventId]/items/import/ImportForm.tsx`**

```tsx
'use client'

import { useActionState, useEffect, useRef } from 'react'
import { handleImportForm, type ImportFormState } from '@/actions/imports'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const initialState: ImportFormState = { status: 'idle' }

export function ImportForm({ eventId }: { eventId: string }) {
  const [state, formAction, isPending] = useActionState(handleImportForm.bind(null, eventId), initialState)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedFileRef = useRef<File | null>(null)

  // React resets uncontrolled form fields (including file inputs) after a
  // form action completes successfully. Since preview and commit are two
  // submits of the same <form>, that reset would wipe the file before the
  // second click. Restore the file the user actually picked so both submits
  // read the same uploaded bytes, matching the same-file design intent.
  useEffect(() => {
    const input = fileInputRef.current
    const file = selectedFileRef.current
    if (input && file && input.files?.length === 0) {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      input.files = dataTransfer.files
    }
  }, [state])

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Input
        ref={fileInputRef}
        name="file"
        type="file"
        accept=".csv,.xlsx"
        required
        onChange={(e) => {
          selectedFileRef.current = e.target.files?.[0] ?? null
        }}
      />
      <div className="flex gap-2">
        <Button type="submit" name="intent" value="preview" disabled={isPending} variant="outline">
          Preview
        </Button>
        <Button type="submit" name="intent" value="commit" disabled={isPending}>
          Confirm import
        </Button>
      </div>

      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.status === 'preview' && (
        <div>
          <p className="text-sm text-foreground">{state.validCount} valid row(s) ready to import.</p>
          {state.rowErrors.length > 0 && (
            <Table className="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.rowErrors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.row}</TableCell>
                    <TableCell>{e.field}</TableCell>
                    <TableCell>{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {state.status === 'committed' && <p className="text-sm text-success">Imported {state.createdCount} item(s).</p>}
    </form>
  )
}
```

- [ ] **Step 3: Run the import E2E spec**

Run: `npx playwright test tests/e2e/import.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/events/[eventId]/items/import/page.tsx" "app/(dashboard)/events/[eventId]/items/import/ImportForm.tsx"
git commit -m "feat: restyle item import page and form"
```

---

## Task 12: Restyle members page and InviteMemberForm

**Files:**
- Modify: `app/(dashboard)/events/[eventId]/members/page.tsx`
- Modify: `app/(dashboard)/events/[eventId]/members/InviteMemberForm.tsx`

**Interfaces:**
- Consumes: `Button`, `Input` (Task 3); `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Badge`, `Alert`, `AlertDescription` (Task 4); `cn` (Task 1).

**Test-sensitive strings/elements (Global Constraint: native select):** `getByPlaceholder('Name')`, `getByPlaceholder('Email')`, `page.selectOption('select[name="role"]', 'SELLER')`, `getByPlaceholder('Seller alias')` (substring match against `"Seller alias (required for Myyjä)"`), `getByRole('button', { name: /^invite$/i })` (anchored — button text must be exactly "Invite") — all from `events.spec.ts`.

- [ ] **Step 1: Restyle `app/(dashboard)/events/[eventId]/members/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { InviteMemberForm } from './InviteMemberForm'
import { Badge } from '@/components/ui/badge'

export default async function MembersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['ADMIN'])
  if (!authz.ok) redirect('/events')

  const memberships = await prisma.eventMembership.findMany({ where: { eventId }, include: { user: true } })

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Members</h1>
        <ul className="mt-4 flex flex-col gap-2">
          {memberships.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-foreground">
              <span>
                {m.user.name} ({m.user.email}) — {m.role}
              </span>
              <Badge variant={m.status === 'ACTIVE' ? 'success' : 'secondary'}>{m.status}</Badge>
            </li>
          ))}
        </ul>
      </div>

      <InviteMemberForm eventId={eventId} />
    </div>
  )
}
```

- [ ] **Step 2: Restyle `app/(dashboard)/events/[eventId]/members/InviteMemberForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { inviteMember } from '@/actions/events'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

export function InviteMemberForm({ eventId }: { eventId: string }) {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await inviteMember(eventId, formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
  }

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Invite a member</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="flex flex-col gap-3">
          <Input name="name" placeholder="Name" required />
          <Input name="email" type="email" placeholder="Email" required />
          {/* Native <select>, not a Select component — events.spec.ts drives
              this via page.selectOption('select[name="role"]', 'SELLER'). */}
          <select
            name="role"
            required
            className={cn(
              'h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <option value="SELLER">Myyjä</option>
            <option value="STAFF">Työvoima</option>
            <option value="ADMIN">Ylläpitäjä</option>
          </select>
          <Input name="sellerAlias" placeholder="Seller alias (required for Myyjä)" />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit">Invite</Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Run the events E2E spec (covers the invite flow)**

Run: `npx playwright test tests/e2e/events.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/events/[eventId]/members/page.tsx" "app/(dashboard)/events/[eventId]/members/InviteMemberForm.tsx"
git commit -m "feat: restyle members page and invite-member form"
```

---

## Task 13: Restyle checkout scanner (keyboard-native confirm)

**Files:**
- Modify: `app/(dashboard)/events/[eventId]/checkout/CheckoutScanner.tsx`

**Interfaces:**
- Consumes: `Input`, `Button` (Task 3); `Card`, `CardContent`, `Alert`, `AlertDescription` (Task 4).

**Test-sensitive strings:** `getByPlaceholder('Scan or type code, then Enter')`, `getByText(/Selling.*Manga Vol\. 1/)`, `getByText('Sold: Manga Vol. 1')`, `getByText('Already sold: Already Sold')` — from `checkout.spec.ts` and `sales-dashboard.spec.ts`. Per the Global Constraints, the confirm block stays a `Card`, not a `Dialog` — focus must never leave the code input.

- [ ] **Step 1: Restyle `app/(dashboard)/events/[eventId]/checkout/CheckoutScanner.tsx`**

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { lookupCode, confirmSale } from '@/actions/sales'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

type LookupResult = { itemId: string; name: string; price: string; sellerAlias: string; status: string }

export function CheckoutScanner({ eventId }: { eventId: string }) {
  const [code, setCode] = useState('')
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [lookup])

  async function handleCodeSubmit() {
    if (!code.trim()) return
    setMessage(null)
    const result = await lookupCode(eventId, code.trim())
    setCode('')
    if (!result.ok) {
      setMessage(result.error.message)
      setLookup(null)
      return
    }
    if (result.data.status === 'SOLD') {
      setMessage(`Already sold: ${result.data.name}`)
      setLookup(null)
      return
    }
    setLookup(result.data)
  }

  async function handleConfirm() {
    if (!lookup) return
    setPending(true)
    const result = await confirmSale(eventId, lookup.itemId, 'BARCODE_SCAN')
    setPending(false)
    setMessage(result.ok ? `Sold: ${lookup.name}` : result.error.message)
    setLookup(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">Checkout</h1>
      {/* Inline Card, not a Dialog: focus must stay in this input across both
          lookup and confirm so a second Enter reaches handleConfirm below. */}
      <Input
        ref={inputRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (lookup) handleConfirm()
          else handleCodeSubmit()
        }}
        autoFocus
        className="max-w-sm text-lg"
        placeholder="Scan or type code, then Enter"
      />

      {lookup && (
        <Card className="max-w-sm">
          <CardContent className="pt-6">
            <p className="text-foreground">
              Selling <strong>{lookup.name}</strong> ({lookup.price} €, {lookup.sellerAlias}). Confirm?
            </p>
            <Button onClick={handleConfirm} disabled={pending} className="mt-3">
              Confirm (Enter)
            </Button>
          </CardContent>
        </Card>
      )}

      {message && (
        <Alert className="max-w-sm">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run the checkout E2E spec**

Run: `npx playwright test tests/e2e/checkout.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/events/[eventId]/checkout/CheckoutScanner.tsx"
git commit -m "feat: restyle checkout scanner, keeping keyboard-only confirm flow"
```

---

## Task 14: Restyle sales dashboard

**Files:**
- Modify: `app/(dashboard)/events/[eventId]/sales/SalesDashboard.tsx`

**Interfaces:**
- Consumes: `Alert`, `AlertDescription`, `Badge` (Task 4).

**Test-sensitive strings:** `getByText('Unsold (1)')`, `getByText('Sold (1)')` — from `sales-dashboard.spec.ts`; these come from the `Sold ({sold.length})` / `Unsold ({listed.length})` headings and must keep that exact `"Sold (N)"` / `"Unsold (N)"` format.

- [ ] **Step 1: Restyle `app/(dashboard)/events/[eventId]/sales/SalesDashboard.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

type SalesSnapshotItem = { id: string; name: string; price: string; status: string; sellerAlias: string }
type SalesSnapshot = { items: SalesSnapshotItem[]; totalRevenue: string; commissionOwed: string }

export function SalesDashboard({ eventId, initialSnapshot }: { eventId: string; initialSnapshot: SalesSnapshot }) {
  const [snapshot, setSnapshot] = useState<SalesSnapshot>(initialSnapshot)
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    const source = new EventSource(`/api/sse/${eventId}`)
    source.onmessage = (event) => {
      setSnapshot(JSON.parse(event.data))
      setConnected(true)
    }
    source.onerror = () => {
      setConnected(false)
    }
    return () => source.close()
  }, [eventId])

  const sold = snapshot.items.filter((i) => i.status === 'SOLD')
  const listed = snapshot.items.filter((i) => i.status === 'LISTED')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Sales</h1>
        {!connected && (
          <Alert variant="warning" className="mt-2 max-w-sm">
            <AlertDescription>Reconnecting…</AlertDescription>
          </Alert>
        )}
        <p className="mt-2 text-foreground">
          Total revenue: {snapshot.totalRevenue} € — Commission owed: {snapshot.commissionOwed} €
        </p>
      </div>

      <div>
        <h2 className="font-medium text-foreground">Sold ({sold.length})</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {sold.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-foreground">
              <span>
                {i.name} — {i.price} € — {i.sellerAlias}
              </span>
              <Badge variant="success">Sold</Badge>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="font-medium text-foreground">Unsold ({listed.length})</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {listed.map((i) => (
            <li key={i.id} className="text-foreground">
              {i.name} — {i.price} € — {i.sellerAlias}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the sales-dashboard E2E spec**

Run: `npx playwright test tests/e2e/sales-dashboard.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/events/[eventId]/sales/SalesDashboard.tsx"
git commit -m "feat: restyle sales dashboard"
```

---

## Task 15: Restyle profile page and PayoutInfoForm

**Files:**
- Modify: `app/(dashboard)/profile/page.tsx`
- Modify: `app/(dashboard)/profile/PayoutInfoForm.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `Label` (Task 3); `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Alert`, `AlertDescription` (Task 4); `cn` (Task 1).

**No E2E coverage exists for this page** (no spec visits `/profile`) — verification for this task is the build plus a manual check, called out explicitly rather than assumed.

- [ ] **Step 1: Restyle `app/(dashboard)/profile/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getOwnPayoutInfo } from '@/lib/services/profile'
import { PayoutInfoForm } from './PayoutInfoForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const info = await getOwnPayoutInfo(session)
  const current = info.ok ? info.data : { payoutMethod: null, iban: null }

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Payout information</CardTitle>
      </CardHeader>
      <CardContent>
        <PayoutInfoForm currentPayoutMethod={current.payoutMethod} currentIban={current.iban} />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Restyle `app/(dashboard)/profile/PayoutInfoForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { updatePayoutInfo } from '@/actions/profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

export function PayoutInfoForm({
  currentPayoutMethod,
  currentIban,
}: {
  currentPayoutMethod: string | null
  currentIban: string | null
}) {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await updatePayoutInfo(formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="payoutMethod">Payout method</Label>
        <select
          id="payoutMethod"
          name="payoutMethod"
          defaultValue={currentPayoutMethod ?? 'CASH'}
          className={cn(
            'h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="iban">IBAN (required for bank transfer)</Label>
        <Input id="iban" name="iban" defaultValue={currentIban ?? ''} />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit">Save</Button>
    </form>
  )
}
```

- [ ] **Step 3: Build check, then manually verify in the browser**

Run: `npm run build`
Expected: build succeeds.

Then: `npm run dev`, log in as any user, visit `/profile`, confirm the form renders correctly styled, switching "Payout method" to "Bank transfer" reveals the IBAN field working as before, and "Save" persists a change (reload the page and confirm the value stuck).

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/profile/page.tsx" "app/(dashboard)/profile/PayoutInfoForm.tsx"
git commit -m "feat: restyle profile and payout-info form"
```

---

## Task 16: Restyle admin page

**Files:**
- Modify: `app/(dashboard)/admin/page.tsx`

**Interfaces:**
- Consumes: `Button` (Task 3); `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` (Task 4).

**Test-sensitive strings/elements:** `getByRole('row', { name: /Target Seller/ })` then `.getByRole('button', { name: /delete pii/i })`, `getByText('Target Seller')` (must reach zero count after delete) — from `pii-deletion.spec.ts`. `TableRow` must stay a real `<tr>` (it is — see Task 4) for the `row` role query to work, and there is deliberately no confirmation step added (Global Constraints).

- [ ] **Step 1: Restyle `app/(dashboard)/admin/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { requireOwner } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { deleteUserPii } from '@/actions/users'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function AdminPage() {
  const session = await auth()
  const authz = await requireOwner(session)
  if (!authz.ok) redirect('/events')

  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Admin</h1>
        <Link href="/audit" className="text-sm text-primary underline-offset-4 hover:underline">
          View audit log
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                {!u.isOwner && (
                  <form
                    action={async () => {
                      'use server'
                      await deleteUserPii(u.id)
                    }}
                  >
                    <Button type="submit" variant="destructive" size="sm">
                      Delete PII
                    </Button>
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Run the PII-deletion E2E spec**

Run: `npx playwright test tests/e2e/pii-deletion.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/admin/page.tsx"
git commit -m "feat: restyle admin page"
```

---

## Task 17: Restyle audit log page

**Files:**
- Modify: `app/(dashboard)/audit/page.tsx`

**Interfaces:**
- Consumes: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` (Task 4).

**No E2E coverage exists for this page** (no spec visits `/audit`) — verification is the build plus a manual check.

- [ ] **Step 1: Restyle `app/(dashboard)/audit/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireOwner } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function AuditLogPage() {
  const session = await auth()
  const authz = await requireOwner(session)
  if (!authz.ok) redirect('/events')

  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { actor: true } })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">Audit log</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{log.createdAt.toISOString()}</TableCell>
              <TableCell>{log.actor.name}</TableCell>
              <TableCell>{log.action}</TableCell>
              <TableCell>
                {log.targetType}:{log.targetId}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Build check, then manually verify in the browser**

Run: `npm run build`
Expected: build succeeds.

Then: `npm run dev`, log in as the owner, trigger at least one audited action (e.g. "Delete PII" from `/admin`), visit `/audit`, confirm the log table renders correctly styled with the new entry visible.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/audit/page.tsx"
git commit -m "feat: restyle audit log page"
```

---

## Task 18: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Full unit/integration suite**

Run: `npm test`
Expected: all tests pass (94+ tests, matching the baseline noted in `docs/next-steps.md`).

- [ ] **Step 3: Full E2E suite**

Run: `npm run test:e2e`
Expected: all 13 specs pass.

- [ ] **Step 4: Manual keyboard-only checkout spot check**

This is the one flow with a real behavioral constraint riding on the restyle (Task 13), so confirm it by hand in addition to the automated spec:
1. `npm run dev`, log in as a staff/admin user, go to a live event's `/checkout`.
2. Without touching the mouse: type a valid item code, press Enter (lookup appears), press Enter again (sale confirms).
3. Confirm focus visibly stayed in the code input throughout (no dialog, no focus jump).

- [ ] **Step 5: Production build**

Run: `npm run build`
Expected: succeeds, matching the "clean production build" baseline from `docs/next-steps.md`.

- [ ] **Step 6: Final commit (if anything was left uncommitted, e.g. a lint auto-fix)**

```bash
git status
```
If clean, no commit needed — every prior task already committed its own changes. If lint or build fixes produced uncommitted changes, stage and commit them with an appropriate message.
