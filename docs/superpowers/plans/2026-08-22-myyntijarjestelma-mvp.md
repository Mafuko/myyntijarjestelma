# Myyntijärjestelmä MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP sales-tracking web app for flea-market events: role-scoped auth, event/item management, CSV import, barcoded price-tag PDFs, a scan-to-sell checkout flow, and real-time sales dashboards.

**Architecture:** Next.js 15 (App Router) + TypeScript on Vercel. Server Components for reads, Server Actions for mutations behind a `lib/services/` business-rule layer, Prisma/Postgres for persistence, Auth.js v5 for credential auth with database sessions, SSE for real-time sale pushes.

**Tech Stack:** Next.js 15, TypeScript, Prisma, PostgreSQL (Neon), Auth.js v5, zod, `@node-rs/argon2` (Argon2id), `bwip-js`, `@react-pdf/renderer`, `papaparse`, `exceljs`, Upstash Redis (`@upstash/ratelimit`), Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-08-22-myyntijarjestelma-design.md](../specs/2026-08-22-myyntijarjestelma-design.md)

## Global Constraints

- Every Server Action validates input with a `zod` schema server-side — no client-only validation (spec §4).
- Every mutation that touches an Event's data goes through `requireEventAccess()` / `requireRole()` from `lib/services/authz.ts` — no ad-hoc permission checks in routes/components (spec §1, §2).
- Money fields use Prisma `Decimal`, never `number`/float (spec §2).
- `barcodeValue` is always server-generated, never accepted from client input (spec §2).
- Server Actions return `{ ok: true, data }` or `{ ok: false, error: { code, message } }` — never throw across the server/client boundary uncaught (spec §5).
- Passwords hashed with argon2id; IBAN encrypted at rest at the application level (spec §4).
- No sensitive fields (`passwordHash`, `iban`) ever appear in logs (spec §4, §5).
- `.env*` stays git-ignored; all secrets via environment variables (already set up in `.gitignore`).

## File Structure

```
prisma/
  schema.prisma
lib/
  db.ts                      # Prisma client singleton
  auth.ts                    # Auth.js config (credentials provider, session callbacks)
  crypto.ts                  # argon2 hash/verify, IBAN encrypt/decrypt helpers
  rate-limit.ts              # Upstash Redis rate limiter factory
  validation/
    user.ts                  # zod schemas: login, invite, accept-invite, payout/IBAN
    event.ts                 # zod schemas: create/update event
    item.ts                  # zod schemas: create/update item
  services/
    authz.ts                 # requireRole(), requireEventAccess()
    audit.ts                 # writeAuditLog()
    users.ts                 # invite, activate, deleteUserPii
    events.ts                # create/update event, manage EventMembership
    items.ts                 # CRUD items, cutoff-date enforcement
    imports.ts                # parse + validate CSV/XLSX rows, atomic commit
    price-tags.tsx             # assign barcodeValue, render PDF (JSX for @react-pdf/renderer)
    sales.ts                  # lookupByCode, recordSale (atomic)
    sales-dashboard.ts         # role-scoped sales snapshot (items, revenue, commission)
    profile.ts                 # seller payout method + encrypted IBAN
actions/
  auth.ts                     # login, logout, acceptInvite
  events.ts                   # createEvent, updateEvent, inviteMember
  items.ts                    # createItem, updateItem, deleteItem
  imports.ts                  # handleImportForm (preview + commit)
  sales.ts                    # lookupCode, confirmSale
  profile.ts                  # updatePayoutInfo
  users.ts                    # deleteUserPii
app/
  (auth)/
    login/page.tsx
    invite/[token]/page.tsx   # set password, activates account
  (dashboard)/
    events/page.tsx           # admin: list/create events
    events/[eventId]/
      page.tsx                # role-aware event home
      items/page.tsx          # seller: manage own items
      items/import/page.tsx   # bulk import preview/commit
      checkout/page.tsx       # staff/admin: scan-to-sell screen
      sales/page.tsx          # live sales dashboard (SSE)
      members/page.tsx        # admin: manage EventMembership
    admin/page.tsx             # owner: user list + PII deletion (Session 10)
    audit/page.tsx             # owner: system-wide AuditLog view (Session 10)
    profile/page.tsx           # any user: payout method + IBAN (Session 10)
  api/
    price-tags/[eventId]/route.ts   # PDF download
    sse/[eventId]/route.ts          # SSE stream (DB-polling based — see Session 9)
  middleware.ts                # security headers, session gate
tests/
  unit/                        # Vitest, mocked Prisma
  integration/                 # Vitest, real test Postgres
  e2e/                         # Playwright
docker-compose.yml              # local Postgres (Session 11)
scripts/init-db.sql             # creates dev + test databases (Session 11)
.github/workflows/ci.yml        # lint, unit/integration, E2E on every push (Session 11)
```

---

## Session 1: Project scaffolding, database schema, and CI foundation

**Session goal:** a running Next.js app with the full Prisma schema migrated against a real test database, and a passing smoke test — the foundation every later session builds on.

### Task 1.1: Scaffold the Next.js project

**Files:**
- Create: entire project root via `create-next-app` (package.json, tsconfig.json, app/layout.tsx, app/page.tsx, next.config.ts, tailwind config, eslint config)

**Interfaces:**
- Produces: a runnable `npm run dev` Next.js 15 App Router + TypeScript + Tailwind project at the repo root.

- [ ] **Step 1: Scaffold the app**

Run (from the repo root, non-interactively):
```bash
npx create-next-app@latest . --typescript --app --tailwind --eslint --src-dir=false --import-alias "@/*" --use-npm --no-turbopack
```
When prompted about the existing `CLAUDE.md`/`docs/`/`.gitignore`/PDF in a non-empty directory, allow it to proceed alongside existing files (or answer "yes" to continue in the non-empty directory).

- [ ] **Step 2: Verify it runs**

Run: `npm run dev` (start in background), then `curl -s http://localhost:3000 | grep -o "<title>[^<]*</title>"`
Expected: a `<title>` tag is present, process exits without a crash. Stop the dev server after checking.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 + TypeScript + Tailwind project"
```

### Task 1.2: Install core dependencies

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: all packages listed in Tech Stack available for later sessions to import.

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install prisma @prisma/client next-auth@beta @auth/prisma-adapter @node-rs/argon2 zod bwip-js @react-pdf/renderer papaparse exceljs @upstash/ratelimit @upstash/redis
```

Note: using `@node-rs/argon2` (prebuilt native bindings) rather than the `argon2` package — the latter requires `node-gyp`/a C++ toolchain to build from source, which is a common source of install failures on Windows dev machines.

- [ ] **Step 2: Install dev/test dependencies**

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @playwright/test dotenv-cli
npx playwright install --with-deps chromium
```

- [ ] **Step 3: Verify install**

Run: `npm ls prisma next-auth argon2 zod vitest @playwright/test`
Expected: every package listed with a resolved version, no `UNMET DEPENDENCY` errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install core runtime and test dependencies"
```

### Task 1.3: Define the Prisma schema and run the first migration

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env.example`

**Interfaces:**
- Produces: the full data model from spec §2 — `User`, `Event`, `EventMembership`, `Category`, `Item`, `Sale`, `AuditLog` — available to every later task via `@prisma/client`.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum EventRole {
  SELLER
  STAFF
  ADMIN
}

enum MembershipStatus {
  PENDING
  ACTIVE
  REMOVED
}

enum PayoutMethod {
  CASH
  BANK_TRANSFER
}

enum ItemStatus {
  LISTED
  SOLD
  REMOVED
}

enum SaleMethod {
  BARCODE_SCAN
  MANUAL_CODE_ENTRY
  MANUAL_OVERRIDE
}

model User {
  id             String   @id @default(cuid())
  name           String
  email          String   @unique
  passwordHash   String?
  phone          String?
  payoutMethod   PayoutMethod?
  ibanCiphertext String?
  isOwner        Boolean  @default(false)
  inviteToken    String?  @unique
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  memberships      EventMembership[]
  createdEvents    Event[]           @relation("EventCreator")
  items            Item[]
  sales            Sale[]            @relation("SaleRecordedBy")
  auditLogsAsActor AuditLog[]        @relation("AuditActor")
}

model Event {
  id                  String   @id @default(cuid())
  name                String
  eventDate           DateTime
  registrationDeadline DateTime
  itemEditCutoffDate  DateTime
  commissionRate      Decimal  @default(0.10) @db.Decimal(5, 4)
  createdByUserId     String
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  createdBy    User              @relation("EventCreator", fields: [createdByUserId], references: [id])
  memberships  EventMembership[]
  categories   Category[]
  items        Item[]
}

model EventMembership {
  id           String            @id @default(cuid())
  userId       String
  eventId      String
  role         EventRole
  sellerAlias  String?
  status       MembershipStatus  @default(PENDING)
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  user  User  @relation(fields: [userId], references: [id])
  event Event @relation(fields: [eventId], references: [id])

  @@unique([userId, eventId])
}

model Category {
  id      String @id @default(cuid())
  eventId String
  name    String

  event Event  @relation(fields: [eventId], references: [id])
  items Item[]

  @@unique([eventId, name])
}

model Item {
  id              String     @id @default(cuid())
  eventId         String
  sellerId        String
  name            String
  price           Decimal    @db.Decimal(10, 2)
  categoryId      String
  isAgeRestricted Boolean    @default(false)
  barcodeValue    String?    @unique
  status          ItemStatus @default(LISTED)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  event    Event     @relation(fields: [eventId], references: [id])
  seller   User      @relation(fields: [sellerId], references: [id])
  category Category  @relation(fields: [categoryId], references: [id])
  sale     Sale?
}

model Sale {
  id           String     @id @default(cuid())
  itemId       String     @unique
  soldByUserId String
  soldAt       DateTime   @default(now())
  method       SaleMethod

  item    Item @relation(fields: [itemId], references: [id])
  soldBy  User @relation("SaleRecordedBy", fields: [soldByUserId], references: [id])
}

model AuditLog {
  id           String   @id @default(cuid())
  actorUserId  String
  action       String
  targetType   String
  targetId     String
  metadata     Json?
  createdAt    DateTime @default(now())

  actor User @relation("AuditActor", fields: [actorUserId], references: [id])
}
```

- [ ] **Step 2: Create `.env.example`**

```
DATABASE_URL="postgresql://user:password@localhost:5432/myyntijarjestelma?schema=public"
DATABASE_URL_TEST="postgresql://user:password@localhost:5432/myyntijarjestelma_test?schema=public"
AUTH_SECRET="generate-with-npx-auth-secret"
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
PII_ENCRYPTION_KEY="32-byte-base64-key-for-iban-encryption"
```

- [ ] **Step 3: Provision a local Postgres and run the migration**

Requires a reachable Postgres instance for `DATABASE_URL` (e.g. `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=myyntijarjestelma postgres:16` for local dev, or a Neon connection string). Copy `.env.example` to `.env` with real values, then:

```bash
npx prisma migrate dev --name init
```
Expected: migration applies with no errors, `prisma/migrations/<timestamp>_init/migration.sql` is created.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations .env.example
git commit -m "feat: add Prisma schema for User, Event, Item, Sale, AuditLog"
```

### Task 1.4: Prisma client singleton and first integration test

**Files:**
- Create: `lib/db.ts`
- Create: `tests/integration/setup.ts`
- Create: `tests/integration/db.test.ts`
- Modify: `package.json` (test scripts), `vitest.config.ts`

**Interfaces:**
- Produces: `import { prisma } from '@/lib/db'` — the single Prisma client instance every service in later sessions uses.
- Produces: `resetDb()` from `tests/integration/setup.ts` — truncates all tables, used by every integration test in later sessions.

- [ ] **Step 1: Write `lib/db.ts`**

> **Post-hoc correction (found during Task 2.3's execution, applies from Task 1.4 onward):** Prisma 7 requires an explicit driver adapter (see Task 1.4's execution notes) — construct `PrismaClient` with `new PrismaPg({ connectionString })` from `@prisma/adapter-pg`. Separately, resolve the connection string per-environment: Vitest always sets `process.env.VITEST`, so `lib/db.ts` should point at `DATABASE_URL_TEST` under Vitest and `DATABASE_URL` otherwise — without this, every service-layer integration test in this plan would seed fixtures via `testPrisma` (pointed at `DATABASE_URL_TEST`) while the service under test reads/writes via `prisma` (pointed at `DATABASE_URL`), two different physical databases. `NODE_ENV` is not a reliable signal for this because Next.js's own dev server forces `NODE_ENV=development` regardless of what's inherited from the parent shell.

```typescript
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const connectionString = process.env.VITEST
  ? process.env.DATABASE_URL_TEST
  : process.env.DATABASE_URL

const adapter = new PrismaPg({ connectionString })

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

- [ ] **Step 2: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Write `tests/integration/setup.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

export const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST } },
})

export async function resetDb() {
  await testPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE "AuditLog", "Sale", "Item", "Category", "EventMembership", "Event", "User"
    RESTART IDENTITY CASCADE
  `)
}
```

- [ ] **Step 4: Write the failing test — `tests/integration/db.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'

describe('database connectivity', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('starts with zero users after reset', async () => {
    const count = await testPrisma.user.count()
    expect(count).toBe(0)
  })

  it('can create and read back a user', async () => {
    const user = await testPrisma.user.create({
      data: { name: 'Test Owner', email: 'owner@example.com', isOwner: true },
    })
    const found = await testPrisma.user.findUnique({ where: { id: user.id } })
    expect(found?.email).toBe('owner@example.com')
  })
})
```

- [ ] **Step 5: Ensure the test database schema exists, then run the test**

```bash
DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy
npx dotenv -e .env -- npx vitest run tests/integration/db.test.ts
```
Expected: both tests PASS. If they fail with a connection error, verify `DATABASE_URL_TEST` in `.env` points at a real, migrated database.

- [ ] **Step 6: Add npm scripts to `package.json`**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/db.ts vitest.config.ts tests/integration/setup.ts tests/integration/db.test.ts package.json
git commit -m "feat: add Prisma client singleton and first integration test"
```

---

## Session 2: Authentication (invite, password hashing, login/logout)

**Session goal:** an invited user can set a password and log in; unauthenticated users are redirected away from protected routes; passwords are argon2id-hashed and never stored or logged in plaintext.

### Task 2.1: Password hashing and IBAN encryption helpers

**Files:**
- Create: `lib/crypto.ts`
- Test: `tests/unit/crypto.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(hash: string, password: string): Promise<boolean>`, `encryptIban(iban: string): string`, `decryptIban(ciphertext: string): string` — used by `lib/auth.ts` (Task 2.2) and later by the seller-profile service (Session 4).

- [ ] **Step 1: Write the failing test — `tests/unit/crypto.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { hashPassword, verifyPassword, encryptIban, decryptIban } from '@/lib/crypto'

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('password hashing', () => {
  it('produces an argon2id hash distinct from the raw password', async () => {
    const h = await hashPassword('correct horse battery staple')
    expect(h).not.toBe('correct horse battery staple')
    expect(h).toMatch(/^\$argon2id\$/)
  })

  it('verifies a correct password and rejects an incorrect one', async () => {
    const h = await hashPassword('correct horse battery staple')
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true)
    expect(await verifyPassword(h, 'wrong password')).toBe(false)
  })
})

describe('IBAN encryption', () => {
  it('round-trips a value through encrypt/decrypt', () => {
    const ciphertext = encryptIban('FI2112345600000785')
    expect(ciphertext).not.toContain('FI21')
    expect(decryptIban(ciphertext)).toBe('FI2112345600000785')
  })

  it('produces different ciphertext for the same input on each call', () => {
    const a = encryptIban('FI2112345600000785')
    const b = encryptIban('FI2112345600000785')
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/crypto.test.ts`
Expected: FAIL — `Cannot find module '@/lib/crypto'`

- [ ] **Step 3: Write `lib/crypto.ts`**

```typescript
import { hash, verify, Algorithm } from '@node-rs/argon2'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { algorithm: Algorithm.Argon2id })
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return verify(hash, password)
}

const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const key = process.env.PII_ENCRYPTION_KEY
  if (!key) throw new Error('PII_ENCRYPTION_KEY is not set')
  const buf = Buffer.from(key, 'base64')
  if (buf.length !== 32) throw new Error('PII_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return buf
}

export function encryptIban(iban: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(iban, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
}

export function decryptIban(ciphertextB64: string): string {
  const key = getEncryptionKey()
  const raw = Buffer.from(ciphertextB64, 'base64')
  const iv = raw.subarray(0, IV_LENGTH)
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/crypto.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/crypto.ts tests/unit/crypto.test.ts
git commit -m "feat: add password hashing and IBAN encryption helpers"
```

### Task 2.2: Auth.js configuration

**Files:**
- Create: `lib/auth.ts`
- Create: `lib/validation/user.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Test: `tests/integration/auth-config.test.ts`

**Interfaces:**
- Consumes: `verifyPassword` from `lib/crypto.ts` (Task 2.1), `prisma` from `lib/db.ts` (Task 1.4).
- Produces: `auth()`, `signIn()`, `signOut()` from `lib/auth.ts` — used by `actions/auth.ts` (Task 2.4) and `middleware.ts` (Task 2.5). `loginSchema` from `lib/validation/user.ts` — used by Task 2.4.

- [ ] **Step 1: Write `lib/validation/user.ts`**

```typescript
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const inviteUserSchema = z
  .object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    role: z.enum(['SELLER', 'STAFF', 'ADMIN']),
    eventId: z.string().min(1),
    sellerAlias: z.string().min(1).max(50).optional(),
  })
  .refine((data) => data.role !== 'SELLER' || !!data.sellerAlias, {
    message: 'sellerAlias is required for the SELLER role',
    path: ['sellerAlias'],
  })

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(10, 'Password must be at least 10 characters'),
})
```

- [ ] **Step 2: Write `lib/auth.ts`**

```typescript
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/crypto'
import { loginSchema } from '@/lib/validation/user'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw)
        if (!parsed.success) return null

        const { email, password } = parsed.data
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.passwordHash) return null

        const valid = await verifyPassword(user.passwordHash, password)
        if (!valid) return null

        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  ],
})
```

- [ ] **Step 3: Write `app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
```

- [ ] **Step 4: Write the integration test — `tests/integration/auth-config.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { hashPassword } from '@/lib/crypto'

describe('credentials provider data path', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('a user created with a hashed password can be found and the hash verifies', async () => {
    const passwordHash = await hashPassword('correct horse battery staple')
    const user = await testPrisma.user.create({
      data: { name: 'Seller One', email: 'seller1@example.com', passwordHash },
    })

    const found = await testPrisma.user.findUnique({ where: { email: 'seller1@example.com' } })
    expect(found?.id).toBe(user.id)
    expect(found?.passwordHash).not.toBe('correct horse battery staple')
  })

  it('a user with no passwordHash (pending invite) cannot be authenticated', async () => {
    await testPrisma.user.create({
      data: { name: 'Pending Seller', email: 'pending@example.com', inviteToken: 'tok123' },
    })
    const found = await testPrisma.user.findUnique({ where: { email: 'pending@example.com' } })
    expect(found?.passwordHash).toBeNull()
  })
})
```

This test exercises the same Prisma query shape `authorize()` uses, without needing a full HTTP request context — `authorize()` itself is exercised end-to-end by the Session 2 E2E test in Task 2.5.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/integration/auth-config.test.ts`
Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts lib/validation/user.ts app/api/auth tests/integration/auth-config.test.ts
git commit -m "feat: configure Auth.js credentials provider with database sessions"
```

### Task 2.3: Invite and account-activation service

**Files:**
- Create: `lib/services/users.ts`
- Test: `tests/integration/users.test.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/db.ts`, `hashPassword` from `lib/crypto.ts`, `inviteUserSchema`/`acceptInviteSchema` from `lib/validation/user.ts`.
- Produces: `inviteUser(input: unknown): Promise<Result<{ inviteUrl: string | null }>>`, `activateInvite(input: unknown): Promise<Result<{ userId: string }>>` — used by `actions/auth.ts` (Task 2.4) and by the event-membership actions in Session 4.

- [ ] **Step 1: Write the failing test — `tests/integration/users.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { inviteUser, activateInvite } from '@/lib/services/users'

async function createOwnerAndEvent() {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Test Event',
      eventDate: new Date('2026-09-01'),
      registrationDeadline: new Date('2026-08-25'),
      itemEditCutoffDate: new Date('2026-08-30'),
      createdByUserId: owner.id,
    },
  })
  return { owner, event }
}

describe('inviteUser', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('creates a pending user and pending membership for a new email, returning an invite URL', async () => {
    const { event } = await createOwnerAndEvent()

    const result = await inviteUser({
      name: 'New Seller',
      email: 'newseller@example.com',
      role: 'SELLER',
      eventId: event.id,
      sellerAlias: 'Kalle',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.inviteUrl).toMatch(/^\/invite\//)

    const membership = await testPrisma.eventMembership.findFirst({ where: { eventId: event.id } })
    expect(membership?.status).toBe('PENDING')
    expect(membership?.role).toBe('SELLER')
  })

  it('adds an already-active user to a new event as ACTIVE with no invite URL', async () => {
    const { event } = await createOwnerAndEvent()
    await testPrisma.user.create({
      data: { name: 'Existing Staff', email: 'staff@example.com', passwordHash: 'x' },
    })

    const result = await inviteUser({
      name: 'Existing Staff',
      email: 'staff@example.com',
      role: 'STAFF',
      eventId: event.id,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.inviteUrl).toBeNull()

    const membership = await testPrisma.eventMembership.findFirst({ where: { eventId: event.id } })
    expect(membership?.status).toBe('ACTIVE')
  })

  it('rejects inviting the same user to the same event twice', async () => {
    const { event } = await createOwnerAndEvent()
    await inviteUser({ name: 'Dup', email: 'dup@example.com', role: 'SELLER', eventId: event.id, sellerAlias: 'D' })

    const result = await inviteUser({
      name: 'Dup',
      email: 'dup@example.com',
      role: 'SELLER',
      eventId: event.id,
      sellerAlias: 'D',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALREADY_MEMBER')
  })

  it('rejects a SELLER invite without a sellerAlias', async () => {
    const { event } = await createOwnerAndEvent()
    const result = await inviteUser({ name: 'No Alias', email: 'noalias@example.com', role: 'SELLER', eventId: event.id })
    expect(result.ok).toBe(false)
  })
})

describe('activateInvite', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('sets a password hash and activates all pending memberships for that user', async () => {
    const { event } = await createOwnerAndEvent()
    const inviteResult = await inviteUser({
      name: 'Seller X',
      email: 'sellerx@example.com',
      role: 'SELLER',
      eventId: event.id,
      sellerAlias: 'X',
    })
    if (!inviteResult.ok) throw new Error('setup failed')
    const token = inviteResult.data.inviteUrl!.split('/').pop()!

    const result = await activateInvite({ token, password: 'a-secure-password-1' })

    expect(result.ok).toBe(true)
    const user = await testPrisma.user.findUnique({ where: { email: 'sellerx@example.com' } })
    expect(user?.passwordHash).toBeTruthy()
    expect(user?.passwordHash).not.toBe('a-secure-password-1')
    expect(user?.inviteToken).toBeNull()

    const membership = await testPrisma.eventMembership.findFirst({ where: { userId: user!.id } })
    expect(membership?.status).toBe('ACTIVE')
  })

  it('rejects an unknown token', async () => {
    const result = await activateInvite({ token: 'does-not-exist', password: 'a-secure-password-1' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_TOKEN')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/users.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/users'`

- [ ] **Step 3: Write `lib/services/users.ts`**

```typescript
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/crypto'
import { inviteUserSchema, acceptInviteSchema } from '@/lib/validation/user'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export async function inviteUser(input: unknown): Promise<Result<{ inviteUrl: string | null }>> {
  const parsed = inviteUserSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }
  const { name, email, role, eventId, sellerAlias } = parsed.data

  let user = await prisma.user.findUnique({ where: { email } })
  let inviteUrl: string | null = null

  if (!user) {
    const inviteToken = randomBytes(24).toString('hex')
    user = await prisma.user.create({ data: { name, email, inviteToken } })
    inviteUrl = `/invite/${inviteToken}`
  } else if (!user.passwordHash) {
    const inviteToken = user.inviteToken ?? randomBytes(24).toString('hex')
    if (inviteToken !== user.inviteToken) {
      user = await prisma.user.update({ where: { id: user.id }, data: { inviteToken } })
    }
    inviteUrl = `/invite/${inviteToken}`
  }

  const existingMembership = await prisma.eventMembership.findUnique({
    where: { userId_eventId: { userId: user.id, eventId } },
  })
  if (existingMembership) {
    return { ok: false, error: { code: 'ALREADY_MEMBER', message: 'User already has a role in this event' } }
  }

  await prisma.eventMembership.create({
    data: {
      userId: user.id,
      eventId,
      role,
      sellerAlias,
      status: user.passwordHash ? 'ACTIVE' : 'PENDING',
    },
  })

  return { ok: true, data: { inviteUrl } }
}

export async function activateInvite(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = acceptInviteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }
  const { token, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { inviteToken: token } })
  if (!user) {
    return { ok: false, error: { code: 'INVALID_TOKEN', message: 'Invite link is invalid or already used' } }
  }

  const passwordHash = await hashPassword(password)

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, inviteToken: null } }),
    prisma.eventMembership.updateMany({
      where: { userId: user.id, status: 'PENDING' },
      data: { status: 'ACTIVE' },
    }),
  ])

  return { ok: true, data: { userId: user.id } }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/users.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/users.ts tests/integration/users.test.ts
git commit -m "feat: add invite and account-activation service"
```

### Task 2.4: Auth Server Actions

**Files:**
- Create: `actions/auth.ts`
- Test: `tests/unit/actions/auth.test.ts`

**Interfaces:**
- Consumes: `signIn`/`signOut` from `lib/auth.ts` (Task 2.2), `activateInvite` from `lib/services/users.ts` (Task 2.3).
- Produces: `login(formData: FormData): Promise<Result<{ redirectTo: string }>>`, `logout(): Promise<void>`, `acceptInvite(formData: FormData): Promise<Result<{ redirectTo: string }>>` — used by the pages in Task 2.5.

- [ ] **Step 1: Write the failing test — `tests/unit/actions/auth.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/lib/services/users', () => ({
  activateInvite: vi.fn(),
}))

describe('login action', () => {
  it('rejects an invalid email without calling signIn', async () => {
    const { login } = await import('@/actions/auth')
    const { signIn } = await import('@/lib/auth')

    const formData = new FormData()
    formData.set('email', 'not-an-email')
    formData.set('password', 'whatever')

    const result = await login(formData)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('returns INVALID_CREDENTIALS when signIn throws', async () => {
    const { login } = await import('@/actions/auth')
    const { signIn } = await import('@/lib/auth')
    vi.mocked(signIn).mockRejectedValueOnce(new Error('CredentialsSignin'))

    const formData = new FormData()
    formData.set('email', 'user@example.com')
    formData.set('password', 'correct-horse-battery-staple')

    const result = await login(formData)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns a redirectTo on success', async () => {
    const { login } = await import('@/actions/auth')
    const { signIn } = await import('@/lib/auth')
    vi.mocked(signIn).mockResolvedValueOnce(undefined as never)

    const formData = new FormData()
    formData.set('email', 'user@example.com')
    formData.set('password', 'correct-horse-battery-staple')

    const result = await login(formData)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.redirectTo).toBe('/events')
  })
})

describe('acceptInvite action', () => {
  it('propagates a service error unchanged', async () => {
    const { acceptInvite } = await import('@/actions/auth')
    const { activateInvite } = await import('@/lib/services/users')
    vi.mocked(activateInvite).mockResolvedValueOnce({
      ok: false,
      error: { code: 'INVALID_TOKEN', message: 'Invite link is invalid or already used' },
    })

    const formData = new FormData()
    formData.set('token', 'bad-token')
    formData.set('password', 'a-secure-password-1')

    const result = await acceptInvite(formData)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_TOKEN')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/actions/auth.test.ts`
Expected: FAIL — `Cannot find module '@/actions/auth'`

- [ ] **Step 3: Write `actions/auth.ts`**

```typescript
'use server'

import { signIn, signOut } from '@/lib/auth'
import { activateInvite } from '@/lib/services/users'
import { loginSchema } from '@/lib/validation/user'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export async function login(formData: FormData): Promise<Result<{ redirectTo: string }>> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  try {
    await signIn('credentials', { ...parsed.data, redirect: false })
    return { ok: true, data: { redirectTo: '/events' } }
  } catch {
    return { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } }
  }
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}

export async function acceptInvite(formData: FormData): Promise<Result<{ redirectTo: string }>> {
  const result = await activateInvite({
    token: formData.get('token'),
    password: formData.get('password'),
  })
  if (!result.ok) return result
  return { ok: true, data: { redirectTo: '/login' } }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/actions/auth.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/auth.ts tests/unit/actions/auth.test.ts
git commit -m "feat: add login, logout, and accept-invite server actions"
```

### Task 2.5: Login/invite pages, session-gating middleware, and end-to-end verification

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/invite/[token]/page.tsx`
- Create: `app/(dashboard)/events/page.tsx` (minimal placeholder — expanded in Session 4)
- Create: `middleware.ts`
- Create: `playwright.config.ts`
- Test: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `login`/`acceptInvite` actions (Task 2.4), `auth()` from `lib/auth.ts` (Task 2.2), `resetDb`/`testPrisma` from `tests/integration/setup.ts` (Task 1.4).
- Produces: the `/login`, `/invite/[token]`, and `/events` routes that Session 4 builds on.

- [ ] **Step 1: Write `app/(auth)/login/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { login } from '@/actions/auth'

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
    <form action={handleSubmit} className="mx-auto mt-20 flex max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">Log in</h1>
      <label className="flex flex-col gap-1">
        Email
        <input name="email" type="email" required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Password
        <input name="password" type="password" required className="rounded border px-2 py-1" />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <button type="submit" className="rounded bg-black px-4 py-2 text-white">
        Log in
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Write `app/(auth)/invite/[token]/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { acceptInvite } from '@/actions/auth'

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
    <form action={handleSubmit} className="mx-auto mt-20 flex max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">Set your password</h1>
      <label className="flex flex-col gap-1">
        Password
        <input name="password" type="password" required minLength={10} className="rounded border px-2 py-1" />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <button type="submit" className="rounded bg-black px-4 py-2 text-white">
        Set password
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Write the placeholder `app/(dashboard)/events/page.tsx`**

```tsx
import { auth } from '@/lib/auth'

export default async function EventsPage() {
  const session = await auth()
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Events</h1>
      <p>Signed in as {session?.user?.email}</p>
    </div>
  )
}
```

- [ ] **Step 4: Write `middleware.ts`**

```typescript
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isProtectedRoute = req.nextUrl.pathname.startsWith('/events')
  if (isProtectedRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }
})

export const config = {
  matcher: ['/events/:path*'],
}
```

- [ ] **Step 5: Write `playwright.config.ts`**

> **Post-hoc correction (same root cause as Task 1.4's `lib/db.ts` fix):** `next dev` forces `NODE_ENV=development` and never sets `VITEST`, so without an explicit override the E2E-spawned dev server would connect to `DATABASE_URL` (dev DB) while every E2E test seeds fixtures via `testPrisma` (pointed at `DATABASE_URL_TEST`) — the same dev/test database mismatch, one layer up. Override `DATABASE_URL` directly for the spawned process via Playwright's `webServer.env`.

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
    },
  },
  use: { baseURL: 'http://localhost:3000' },
})
```

- [ ] **Step 6: Write the failing E2E test — `tests/e2e/auth.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'

test.beforeEach(async () => {
  await resetDb()
})

test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('invited user sets a password, logs in, and unauthenticated access is redirected', async ({ page }) => {
  const inviteToken = 'e2e-test-token-123'
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'irrelevant' },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Test Flea Market',
      eventDate: new Date('2026-09-01'),
      registrationDeadline: new Date('2026-08-25'),
      itemEditCutoffDate: new Date('2026-08-30'),
      createdByUserId: owner.id,
    },
  })
  const seller = await testPrisma.user.create({
    data: { name: 'Test Seller', email: 'seller@example.com', inviteToken },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kirppis-Kalle', status: 'PENDING' },
  })

  await page.goto(`/invite/${inviteToken}`)
  await page.getByLabel('Password').fill('a-very-secure-password')
  await page.getByRole('button', { name: /set password/i }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.getByLabel('Email').fill('seller@example.com')
  await page.getByLabel('Password').fill('a-very-secure-password')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)
  await expect(page.getByText('seller@example.com')).toBeVisible()

  await page.context().clearCookies()
  await page.goto('/events')
  await expect(page).toHaveURL(/\/login/)
})
```

- [ ] **Step 7: Run the E2E test to verify it fails, then passes**

Set `DATABASE_URL` and `DATABASE_URL_TEST` (and `AUTH_SECRET`, `PII_ENCRYPTION_KEY`) in `.env`, ensure the test database is migrated (`DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy`), then:

```bash
npx playwright test tests/e2e/auth.spec.ts
```
Expected: first run FAILS (routes don't exist yet, if run before Steps 1-5) or PASSES once Steps 1-6 are complete. Confirm it passes before moving on.

- [ ] **Step 8: Commit**

```bash
git add "app/(auth)" "app/(dashboard)" middleware.ts playwright.config.ts tests/e2e/auth.spec.ts
git commit -m "feat: add login/invite pages, session-gating middleware, and auth E2E test"
```

---

## Session 3: Authorization, audit logging, and security headers

**Session goal:** a centralized, thoroughly-tested authorization guard every later Server Action calls before touching data; an audit trail for security-sensitive actions; and baseline security headers on every response. This is the session the spec's "security is a priority" commitment cashes out in — every session after this one is built on top of `requireEventAccess()`.

### Task 3.1: Authorization guard with a full permission matrix test

**Files:**
- Create: `lib/services/authz.ts`
- Test: `tests/integration/authz.test.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/db.ts`.
- Produces: `requireEventAccess(session, eventId, allowedRoles): Promise<AuthzResult>`, `requireOwner(session): Promise<AuthzResult>`, and the `AuthzResult`/`Role` types — used by every Server Action from Session 4 onward.

- [ ] **Step 1: Write the failing test — `tests/integration/authz.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { requireEventAccess, requireOwner } from '@/lib/services/authz'

async function setupEventWithMembers() {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' },
  })
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })
  const staff = await testPrisma.user.create({ data: { name: 'Staff', email: 'staff@example.com', passwordHash: 'x' } })
  const admin = await testPrisma.user.create({ data: { name: 'Admin', email: 'admin@example.com', passwordHash: 'x' } })
  const outsider = await testPrisma.user.create({ data: { name: 'Outsider', email: 'outsider@example.com', passwordHash: 'x' } })

  const event = await testPrisma.event.create({
    data: {
      name: 'Event A',
      eventDate: new Date('2026-09-01'),
      registrationDeadline: new Date('2026-08-25'),
      itemEditCutoffDate: new Date('2026-08-30'),
      createdByUserId: owner.id,
    },
  })
  const otherEvent = await testPrisma.event.create({
    data: {
      name: 'Event B',
      eventDate: new Date('2026-10-01'),
      registrationDeadline: new Date('2026-09-25'),
      itemEditCutoffDate: new Date('2026-09-30'),
      createdByUserId: owner.id,
    },
  })

  await testPrisma.eventMembership.createMany({
    data: [
      { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'S', status: 'ACTIVE' },
      { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' },
      { userId: admin.id, eventId: event.id, role: 'ADMIN', status: 'ACTIVE' },
    ],
  })

  return { owner, seller, staff, admin, outsider, event, otherEvent }
}

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

describe('requireEventAccess authorization matrix', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('denies an unauthenticated caller', async () => {
    const { event } = await setupEventWithMembers()
    const result = await requireEventAccess(null, event.id, ['ADMIN'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED')
  })

  it('allows the owner regardless of membership', async () => {
    const { owner, event } = await setupEventWithMembers()
    const result = await requireEventAccess(sessionFor(owner.id), event.id, ['ADMIN'])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.role).toBe('OWNER')
  })

  it('allows a matching role', async () => {
    const { staff, event } = await setupEventWithMembers()
    const result = await requireEventAccess(sessionFor(staff.id), event.id, ['STAFF', 'ADMIN'])
    expect(result.ok).toBe(true)
  })

  it('denies a non-matching role', async () => {
    const { seller, event } = await setupEventWithMembers()
    const result = await requireEventAccess(sessionFor(seller.id), event.id, ['ADMIN'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FORBIDDEN')
  })

  it('denies a user with no membership in the event', async () => {
    const { outsider, event } = await setupEventWithMembers()
    const result = await requireEventAccess(sessionFor(outsider.id), event.id, ['SELLER', 'STAFF', 'ADMIN'])
    expect(result.ok).toBe(false)
  })

  it('denies a membership scoped to a different event', async () => {
    const { seller, otherEvent } = await setupEventWithMembers()
    const result = await requireEventAccess(sessionFor(seller.id), otherEvent.id, ['SELLER'])
    expect(result.ok).toBe(false)
  })

  it('denies a REMOVED membership even with a matching role', async () => {
    const { event, staff } = await setupEventWithMembers()
    await testPrisma.eventMembership.update({
      where: { userId_eventId: { userId: staff.id, eventId: event.id } },
      data: { status: 'REMOVED' },
    })
    const result = await requireEventAccess(sessionFor(staff.id), event.id, ['STAFF'])
    expect(result.ok).toBe(false)
  })
})

describe('requireOwner', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('allows the owner', async () => {
    const { owner } = await setupEventWithMembers()
    const result = await requireOwner(sessionFor(owner.id))
    expect(result.ok).toBe(true)
  })

  it('denies a non-owner', async () => {
    const { admin } = await setupEventWithMembers()
    const result = await requireOwner(sessionFor(admin.id))
    expect(result.ok).toBe(false)
  })

  it('denies an unauthenticated caller', async () => {
    const result = await requireOwner(null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNAUTHENTICATED')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/authz.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/authz'`

- [ ] **Step 3: Write `lib/services/authz.ts`**

```typescript
import { prisma } from '@/lib/db'

export type Role = 'SELLER' | 'STAFF' | 'ADMIN'

export type AuthzResult =
  | { ok: true; userId: string; role: Role | 'OWNER' }
  | { ok: false; error: { code: 'UNAUTHENTICATED' | 'FORBIDDEN'; message: string } }

type MinimalSession = { user?: { id?: string | null } | null } | null

export async function requireEventAccess(
  session: MinimalSession,
  eventId: string,
  allowedRoles: Role[]
): Promise<AuthzResult> {
  const userId = session?.user?.id
  if (!userId) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (user?.isOwner) {
    return { ok: true, userId, role: 'OWNER' }
  }

  const membership = await prisma.eventMembership.findUnique({
    where: { userId_eventId: { userId, eventId } },
  })
  if (!membership || membership.status !== 'ACTIVE' || !allowedRoles.includes(membership.role)) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'You do not have access to this event' } }
  }

  return { ok: true, userId, role: membership.role }
}

export async function requireOwner(session: MinimalSession): Promise<AuthzResult> {
  const userId = session?.user?.id
  if (!userId) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }
  }
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.isOwner) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Only the site owner can perform this action' } }
  }
  return { ok: true, userId, role: 'OWNER' }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/authz.test.ts`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/authz.ts tests/integration/authz.test.ts
git commit -m "feat: add requireEventAccess/requireOwner authorization guards"
```

### Task 3.2: Audit log service with metadata redaction

**Files:**
- Create: `lib/services/audit.ts`
- Test: `tests/integration/audit.test.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/db.ts`.
- Produces: `writeAuditLog(params): Promise<void>` — called from event/item/membership mutation services starting in Session 4.

- [ ] **Step 1: Write the failing test — `tests/integration/audit.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { writeAuditLog } from '@/lib/services/audit'

describe('writeAuditLog', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('creates an audit log row with the given fields', async () => {
    const actor = await testPrisma.user.create({ data: { name: 'Admin', email: 'admin2@example.com', passwordHash: 'x' } })
    await writeAuditLog({
      actorUserId: actor.id,
      action: 'EVENT_COMMISSION_RATE_CHANGED',
      targetType: 'Event',
      targetId: 'event-123',
      metadata: { from: '0.10', to: '0.12' },
    })

    const logs = await testPrisma.auditLog.findMany()
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('EVENT_COMMISSION_RATE_CHANGED')
    expect(logs[0].metadata).toEqual({ from: '0.10', to: '0.12' })
  })

  it('redacts sensitive keys in metadata instead of storing them', async () => {
    const actor = await testPrisma.user.create({ data: { name: 'Admin', email: 'admin3@example.com', passwordHash: 'x' } })
    await writeAuditLog({
      actorUserId: actor.id,
      action: 'USER_PASSWORD_RESET',
      targetType: 'User',
      targetId: 'user-456',
      metadata: { passwordHash: 'should-not-be-stored', iban: 'FI2112345600000785' },
    })

    const log = await testPrisma.auditLog.findFirstOrThrow()
    expect(log.metadata).toEqual({ passwordHash: '[redacted]', iban: '[redacted]' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/audit.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/audit'`

- [ ] **Step 3: Write `lib/services/audit.ts`**

```typescript
import { prisma } from '@/lib/db'

const SENSITIVE_KEYS = new Set(['password', 'passwordHash', 'iban', 'ibanCiphertext'])

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    clean[key] = SENSITIVE_KEYS.has(key) ? '[redacted]' : value
  }
  return clean
}

export async function writeAuditLog(params: {
  actorUserId: string
  action: string
  targetType: string
  targetId: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: params.actorUserId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata ? sanitizeMetadata(params.metadata) : undefined,
    },
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/audit.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/audit.ts tests/integration/audit.test.ts
git commit -m "feat: add audit log service with sensitive-field redaction"
```

### Task 3.3: Security response headers

**Files:**
- Modify: `middleware.ts` (from Task 2.5 — broadens the matcher to all routes and adds headers alongside the existing auth redirect)
- Test: `tests/e2e/security-headers.spec.ts`

**Interfaces:**
- Consumes: the existing `auth()`-wrapped middleware from Task 2.5.
- Produces: no new exports — verified by response headers, which every later page implicitly relies on for browser-level protections (clickjacking, MIME sniffing, forced HTTPS).

- [ ] **Step 1: Write the failing test — `tests/e2e/security-headers.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

test('responses include core security headers', async ({ page }) => {
  const response = await page.goto('/login')
  const headers = response?.headers() ?? {}

  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/security-headers.spec.ts`
Expected: FAIL — headers are absent.

- [ ] **Step 3: Modify `middleware.ts`**

```typescript
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
}

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isProtectedRoute = req.nextUrl.pathname.startsWith('/events')

  const response =
    isProtectedRoute && !isLoggedIn
      ? NextResponse.redirect(new URL('/login', req.nextUrl))
      : NextResponse.next()

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

Known trade-off, not a bug: `script-src 'self' 'unsafe-inline'` is required because Next.js injects inline hydration data; a stricter nonce-based CSP is listed as a hardening follow-up in Session 10, not silently dropped.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/security-headers.spec.ts`
Expected: PASS.

- [ ] **Step 5: Re-run the Session 2 auth E2E test to confirm the broadened matcher didn't break the redirect behavior**

Run: `npx playwright test tests/e2e/auth.spec.ts`
Expected: still PASS.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts tests/e2e/security-headers.spec.ts
git commit -m "feat: add security response headers to middleware"
```

---

## Session 4: Event management and membership invites

**Session goal:** the owner can create an event (seeded with default categories); admins can invite sellers/staff by email and edit the commission rate; every mutation is authorization-checked and audit-logged.

### Task 4.1: Event validation schemas and service

**Files:**
- Create: `lib/validation/event.ts`
- Create: `lib/services/events.ts`
- Test: `tests/integration/events.test.ts`

**Interfaces:**
- Consumes: `requireOwner`/`requireEventAccess` (Task 3.1), `writeAuditLog` (Task 3.2), `prisma`.
- Produces: `createEvent(session, input)`, `updateEvent(session, eventId, input)`, `listEventsForUser(userId)` — used by `actions/events.ts` (Task 4.3) and the pages in Task 4.4.

- [ ] **Step 1: Write the failing test — `tests/integration/events.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { createEvent, updateEvent, listEventsForUser } from '@/lib/services/events'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function makeUsers() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const other = await testPrisma.user.create({ data: { name: 'Other', email: 'other@example.com', passwordHash: 'x' } })
  return { owner, other }
}

const EVENT_INPUT = {
  name: 'Kesäkirppis',
  eventDate: '2026-09-01',
  registrationDeadline: '2026-08-25',
  itemEditCutoffDate: '2026-08-30',
}

describe('createEvent', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('allows the owner to create an event with default categories seeded and an audit entry written', async () => {
    const { owner } = await makeUsers()
    const result = await createEvent(sessionFor(owner.id), EVENT_INPUT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const categories = await testPrisma.category.findMany({ where: { eventId: result.data.eventId } })
    expect(categories.length).toBeGreaterThan(0)

    const log = await testPrisma.auditLog.findFirst({ where: { action: 'EVENT_CREATED' } })
    expect(log?.targetId).toBe(result.data.eventId)
  })

  it('rejects a non-owner', async () => {
    const { other } = await makeUsers()
    const result = await createEvent(sessionFor(other.id), EVENT_INPUT)
    expect(result.ok).toBe(false)
  })

  it('rejects an unauthenticated caller', async () => {
    const result = await createEvent(null, EVENT_INPUT)
    expect(result.ok).toBe(false)
  })
})

describe('updateEvent', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('logs a commission-rate-changed audit entry only when the rate actually changes', async () => {
    const { owner } = await makeUsers()
    const created = await createEvent(sessionFor(owner.id), EVENT_INPUT)
    if (!created.ok) throw new Error('setup failed')

    await updateEvent(sessionFor(owner.id), created.data.eventId, { name: 'Renamed' })
    let logs = await testPrisma.auditLog.findMany({ where: { action: 'EVENT_COMMISSION_RATE_CHANGED' } })
    expect(logs).toHaveLength(0)

    await updateEvent(sessionFor(owner.id), created.data.eventId, { commissionRate: 0.15 })
    logs = await testPrisma.auditLog.findMany({ where: { action: 'EVENT_COMMISSION_RATE_CHANGED' } })
    expect(logs).toHaveLength(1)
  })
})

describe('listEventsForUser', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it("shows the owner all events, and a member only their ACTIVE-membership events", async () => {
    const { owner, other } = await makeUsers()
    const created = await createEvent(sessionFor(owner.id), EVENT_INPUT)
    if (!created.ok) throw new Error('setup failed')

    await testPrisma.eventMembership.create({
      data: { userId: other.id, eventId: created.data.eventId, role: 'STAFF', status: 'PENDING' },
    })

    expect(await listEventsForUser(owner.id)).toHaveLength(1)
    expect(await listEventsForUser(other.id)).toHaveLength(0)

    await testPrisma.eventMembership.updateMany({ where: { userId: other.id }, data: { status: 'ACTIVE' } })
    const otherEvents = await listEventsForUser(other.id)
    expect(otherEvents).toHaveLength(1)
    expect(otherEvents[0].role).toBe('STAFF')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/events.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/events'`

- [ ] **Step 3: Write `lib/validation/event.ts`**

```typescript
import { z } from 'zod'

export const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  eventDate: z.coerce.date(),
  registrationDeadline: z.coerce.date(),
  itemEditCutoffDate: z.coerce.date(),
  commissionRate: z.coerce.number().min(0).max(1).optional().default(0.1),
})

export const updateEventSchema = createEventSchema.partial()
```

- [ ] **Step 4: Write `lib/services/events.ts`**

```typescript
import { prisma } from '@/lib/db'
import { requireOwner, requireEventAccess } from '@/lib/services/authz'
import { writeAuditLog } from '@/lib/services/audit'
import { inviteUser } from '@/lib/services/users'
import { createEventSchema, updateEventSchema } from '@/lib/validation/event'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

const DEFAULT_CATEGORIES = ['Vaatteet', 'Kirjat ja lehdet', 'Lelut', 'Elektroniikka', 'Kodintavarat', 'Muu']

export async function createEvent(session: MinimalSession, input: unknown): Promise<Result<{ eventId: string }>> {
  const authz = await requireOwner(session)
  if (!authz.ok) return authz

  const parsed = createEventSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  // Post-hoc correction (Task 4.1's review): event creation and default-category
  // seeding must be atomic — without a transaction, a failure between the two
  // writes leaves an Event with zero categories, which blocks sellers from
  // adding any items until an admin manually fixes it.
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({ data: { ...parsed.data, createdByUserId: authz.userId } })
    await tx.category.createMany({
      data: DEFAULT_CATEGORIES.map((name) => ({ eventId: created.id, name })),
    })
    return created
  })

  await writeAuditLog({
    actorUserId: authz.userId,
    action: 'EVENT_CREATED',
    targetType: 'Event',
    targetId: event.id,
    metadata: { name: event.name },
  })

  return { ok: true, data: { eventId: event.id } }
}

export async function updateEvent(
  session: MinimalSession,
  eventId: string,
  input: unknown
): Promise<Result<{ eventId: string }>> {
  const authz = await requireEventAccess(session, eventId, ['ADMIN'])
  if (!authz.ok) return authz

  const parsed = updateEventSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  const before = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  const event = await prisma.event.update({ where: { id: eventId }, data: parsed.data })

  if (parsed.data.commissionRate !== undefined && !before.commissionRate.equals(event.commissionRate)) {
    await writeAuditLog({
      actorUserId: authz.userId,
      action: 'EVENT_COMMISSION_RATE_CHANGED',
      targetType: 'Event',
      targetId: eventId,
      metadata: { from: before.commissionRate.toString(), to: event.commissionRate.toString() },
    })
  }

  return { ok: true, data: { eventId: event.id } }
}

export async function listEventsForUser(
  userId: string
): Promise<Array<{ id: string; name: string; eventDate: Date; role: string }>> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  if (user.isOwner) {
    const events = await prisma.event.findMany({ orderBy: { eventDate: 'desc' } })
    return events.map((e) => ({ id: e.id, name: e.name, eventDate: e.eventDate, role: 'OWNER' }))
  }

  const memberships = await prisma.eventMembership.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { event: true },
    orderBy: { event: { eventDate: 'desc' } },
  })
  return memberships.map((m) => ({ id: m.event.id, name: m.event.name, eventDate: m.event.eventDate, role: m.role }))
}

export async function inviteMemberToEvent(
  session: MinimalSession,
  input: { name: string; email: string; role: 'SELLER' | 'STAFF' | 'ADMIN'; eventId: string; sellerAlias?: string }
): Promise<Result<{ inviteUrl: string | null }>> {
  const authz = await requireEventAccess(session, input.eventId, ['ADMIN'])
  if (!authz.ok) return authz

  const result = await inviteUser(input)
  if (!result.ok) return result

  await writeAuditLog({
    actorUserId: authz.userId,
    action: 'MEMBER_INVITED',
    targetType: 'Event',
    targetId: input.eventId,
    metadata: { invitedEmail: input.email, role: input.role },
  })

  return result
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/integration/events.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/validation/event.ts lib/services/events.ts tests/integration/events.test.ts
git commit -m "feat: add event create/update/list service with audit logging"
```

### Task 4.2: Membership invite authorization test

**Files:**
- Modify: `tests/integration/events.test.ts` (adds an `inviteMemberToEvent` describe block)

**Interfaces:**
- Consumes: `inviteMemberToEvent` from Task 4.1.

- [ ] **Step 1: Append the failing tests to `tests/integration/events.test.ts`**

```typescript
import { inviteMemberToEvent } from '@/lib/services/events'

describe('inviteMemberToEvent', () => {
  beforeEach(async () => {
    await resetDb()
  })
  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('allows an ADMIN member to invite and writes an audit log', async () => {
    const { owner } = await makeUsers()
    const created = await createEvent(sessionFor(owner.id), EVENT_INPUT)
    if (!created.ok) throw new Error('setup failed')

    const result = await inviteMemberToEvent(sessionFor(owner.id), {
      name: 'New Seller',
      email: 'newseller@example.com',
      role: 'SELLER',
      eventId: created.data.eventId,
      sellerAlias: 'Kalle',
    })

    expect(result.ok).toBe(true)
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'MEMBER_INVITED' } })
    expect(log?.metadata).toMatchObject({ invitedEmail: 'newseller@example.com' })
  })

  it('rejects a SELLER trying to invite another member', async () => {
    const { owner } = await makeUsers()
    const created = await createEvent(sessionFor(owner.id), EVENT_INPUT)
    if (!created.ok) throw new Error('setup failed')

    const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller2@example.com', passwordHash: 'x' } })
    await testPrisma.eventMembership.create({
      data: { userId: seller.id, eventId: created.data.eventId, role: 'SELLER', sellerAlias: 'S', status: 'ACTIVE' },
    })

    const result = await inviteMemberToEvent(sessionFor(seller.id), {
      name: 'Blocked',
      email: 'blocked@example.com',
      role: 'STAFF',
      eventId: created.data.eventId,
    })

    expect(result.ok).toBe(false)
  })
})
```

(Add the `import { inviteMemberToEvent } from '@/lib/services/events'` line to the existing import block at the top of the file instead of duplicating imports.)

- [ ] **Step 2: Run the test to verify it fails, then passes**

Run: `npx vitest run tests/integration/events.test.ts`
Expected: initially fails if `inviteMemberToEvent` weren't already implemented — since Task 4.1 already implemented it, this should PASS immediately (all 8 tests in the file).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/events.test.ts
git commit -m "test: add membership invite authorization coverage"
```

### Task 4.3: Event and membership Server Actions

**Files:**
- Create: `actions/events.ts`
- Test: `tests/unit/actions/events.test.ts`

**Interfaces:**
- Consumes: `createEvent`/`updateEvent`/`inviteMemberToEvent` from Task 4.1, `auth()` from `lib/auth.ts`.
- Produces: `createEvent(formData)`, `updateEvent(eventId, formData)`, `inviteMember(eventId, formData)` — used by the pages in Task 4.4.

- [ ] **Step 1: Write the failing test — `tests/unit/actions/events.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }) }))
vi.mock('@/lib/services/events', () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  inviteMemberToEvent: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('createEvent action', () => {
  it('parses form fields and forwards them to the service with the current session', async () => {
    const { createEvent: createEventAction } = await import('@/actions/events')
    const { createEvent: createEventService } = await import('@/lib/services/events')
    vi.mocked(createEventService).mockResolvedValueOnce({ ok: true, data: { eventId: 'evt-1' } })

    const formData = new FormData()
    formData.set('name', 'Kesäkirppis')
    formData.set('eventDate', '2026-09-01')
    formData.set('registrationDeadline', '2026-08-25')
    formData.set('itemEditCutoffDate', '2026-08-30')

    const result = await createEventAction(formData)

    expect(result.ok).toBe(true)
    expect(createEventService).toHaveBeenCalledWith(
      { user: { id: 'user-1' } },
      expect.objectContaining({ name: 'Kesäkirppis' })
    )
  })
})

describe('inviteMember action', () => {
  it('includes the eventId from the route parameter in the service call', async () => {
    const { inviteMember } = await import('@/actions/events')
    const { inviteMemberToEvent } = await import('@/lib/services/events')
    vi.mocked(inviteMemberToEvent).mockResolvedValueOnce({ ok: true, data: { inviteUrl: null } })

    const formData = new FormData()
    formData.set('name', 'New Staff')
    formData.set('email', 'staff@example.com')
    formData.set('role', 'STAFF')

    await inviteMember('evt-1', formData)

    expect(inviteMemberToEvent).toHaveBeenCalledWith(
      { user: { id: 'user-1' } },
      expect.objectContaining({ eventId: 'evt-1', email: 'staff@example.com', role: 'STAFF' })
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/actions/events.test.ts`
Expected: FAIL — `Cannot find module '@/actions/events'`

- [ ] **Step 3: Write `actions/events.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  createEvent as createEventService,
  updateEvent as updateEventService,
  inviteMemberToEvent,
} from '@/lib/services/events'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export async function createEvent(formData: FormData): Promise<Result<{ eventId: string }>> {
  const session = await auth()
  const result = await createEventService(session, {
    name: formData.get('name'),
    eventDate: formData.get('eventDate'),
    registrationDeadline: formData.get('registrationDeadline'),
    itemEditCutoffDate: formData.get('itemEditCutoffDate'),
    commissionRate: formData.get('commissionRate') || undefined,
  })
  if (result.ok) revalidatePath('/events')
  return result
}

export async function updateEvent(eventId: string, formData: FormData): Promise<Result<{ eventId: string }>> {
  const session = await auth()
  const result = await updateEventService(session, eventId, {
    commissionRate: formData.get('commissionRate') || undefined,
  })
  if (result.ok) revalidatePath(`/events/${eventId}`)
  return result
}

export async function inviteMember(
  eventId: string,
  formData: FormData
): Promise<Result<{ inviteUrl: string | null }>> {
  const session = await auth()
  const result = await inviteMemberToEvent(session, {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    role: formData.get('role') as 'SELLER' | 'STAFF' | 'ADMIN',
    eventId,
    sellerAlias: formData.get('sellerAlias') ? String(formData.get('sellerAlias')) : undefined,
  })
  if (result.ok) revalidatePath(`/events/${eventId}/members`)
  return result
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/actions/events.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/events.ts tests/unit/actions/events.test.ts
git commit -m "feat: add event and membership server actions"
```

### Task 4.4: Event pages and end-to-end verification

**Files:**
- Modify: `app/(dashboard)/events/page.tsx` (replaces the Session 2 placeholder with a real list + create form)
- Create: `app/(dashboard)/events/[eventId]/page.tsx`
- Create: `app/(dashboard)/events/[eventId]/members/page.tsx`
- Test: `tests/e2e/events.spec.ts`

**Interfaces:**
- Consumes: `listEventsForUser` (Task 4.1), `createEvent`/`updateEvent`/`inviteMember` actions (Task 4.3), `requireEventAccess` (Task 3.1).

- [ ] **Step 1: Write `app/(dashboard)/events/page.tsx`**

```tsx
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { listEventsForUser } from '@/lib/services/events'
import { createEvent } from '@/actions/events'

export default async function EventsPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const events = await listEventsForUser(session.user.id)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Events</h1>
      <ul className="mt-4 flex flex-col gap-2">
        {events.map((e) => (
          <li key={e.id}>
            <Link href={`/events/${e.id}`} className="underline">
              {e.name}
            </Link>{' '}
            — {e.role}
          </li>
        ))}
      </ul>

      {user.isOwner && (
        <form
          action={async (formData) => {
            'use server'
            await createEvent(formData)
          }}
          className="mt-8 flex max-w-sm flex-col gap-3"
        >
          <h2 className="font-medium">Create event</h2>
          <input name="name" placeholder="Event name" required className="rounded border px-2 py-1" />
          <label className="flex flex-col gap-1 text-sm">
            Event date
            <input name="eventDate" type="date" required className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Registration deadline
            <input name="registrationDeadline" type="date" required className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Item edit cutoff
            <input name="itemEditCutoffDate" type="date" required className="rounded border px-2 py-1" />
          </label>
          <button type="submit" className="rounded bg-black px-4 py-2 text-white">
            Create event
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write `app/(dashboard)/events/[eventId]/page.tsx`**

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { updateEvent } from '@/actions/events'

export default async function EventHomePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER', 'STAFF', 'ADMIN'])
  if (!authz.ok) redirect('/events')

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  const canManage = authz.role === 'ADMIN' || authz.role === 'OWNER'

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">{event.name}</h1>
      <nav className="mt-4 flex flex-col gap-2">
        <Link href={`/events/${eventId}/items`} className="underline">
          My items
        </Link>
        {(authz.role === 'STAFF' || canManage) && (
          <Link href={`/events/${eventId}/checkout`} className="underline">
            Checkout
          </Link>
        )}
        <Link href={`/events/${eventId}/sales`} className="underline">
          Sales
        </Link>
        {canManage && (
          <Link href={`/events/${eventId}/members`} className="underline">
            Members
          </Link>
        )}
      </nav>

      {canManage && (
        <form
          action={async (formData) => {
            'use server'
            await updateEvent(eventId, formData)
          }}
          className="mt-6 flex max-w-xs items-end gap-2"
        >
          <label className="flex flex-col gap-1 text-sm">
            Commission rate (0–1)
            <input
              name="commissionRate"
              type="number"
              step="0.01"
              min="0"
              max="1"
              defaultValue={event.commissionRate.toString()}
              className="rounded border px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded bg-black px-3 py-1.5 text-white">
            Update
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Write `app/(dashboard)/events/[eventId]/members/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { inviteMember } from '@/actions/events'

export default async function MembersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['ADMIN'])
  if (!authz.ok) redirect('/events')

  const memberships = await prisma.eventMembership.findMany({ where: { eventId }, include: { user: true } })

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Members</h1>
      <ul className="mt-4 flex flex-col gap-1">
        {memberships.map((m) => (
          <li key={m.id}>
            {m.user.name} ({m.user.email}) — {m.role} — {m.status}
          </li>
        ))}
      </ul>

      <form
        action={async (formData) => {
          'use server'
          await inviteMember(eventId, formData)
        }}
        className="mt-8 flex max-w-sm flex-col gap-3"
      >
        <h2 className="font-medium">Invite a member</h2>
        <input name="name" placeholder="Name" required className="rounded border px-2 py-1" />
        <input name="email" type="email" placeholder="Email" required className="rounded border px-2 py-1" />
        <select name="role" required className="rounded border px-2 py-1">
          <option value="SELLER">Myyjä</option>
          <option value="STAFF">Työvoima</option>
          <option value="ADMIN">Ylläpitäjä</option>
        </select>
        <input name="sellerAlias" placeholder="Seller alias (required for Myyjä)" className="rounded border px-2 py-1" />
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          Invite
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Write the failing E2E test — `tests/e2e/events.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('owner creates an event and invites a seller who can then see it', async ({ page, context }) => {
  const passwordHash = await hashPassword('owner-password-123')
  await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('owner@example.com')
  await page.getByLabel('Password').fill('owner-password-123')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)

  await page.getByPlaceholder('Event name').fill('Syyskirppis')
  await page.getByLabel('Event date').fill('2026-09-15')
  await page.getByLabel('Registration deadline').fill('2026-09-01')
  await page.getByLabel('Item edit cutoff').fill('2026-09-10')
  await page.getByRole('button', { name: /create event/i }).click()
  await expect(page.getByText('Syyskirppis')).toBeVisible()

  await page.getByText('Syyskirppis').click()
  await page.getByRole('link', { name: /members/i }).click()

  await page.getByPlaceholder('Name').fill('Invited Seller')
  await page.getByPlaceholder('Email').fill('invitedseller@example.com')
  await page.selectOption('select[name="role"]', 'SELLER')
  await page.getByPlaceholder('Seller alias').fill('Kirppis-Liisa')
  await page.getByRole('button', { name: /^invite$/i }).click()

  const invitedUser = await testPrisma.user.findUniqueOrThrow({ where: { email: 'invitedseller@example.com' } })
  expect(invitedUser.inviteToken).toBeTruthy()

  await context.clearCookies()
  await page.goto(`/invite/${invitedUser.inviteToken}`)
  await page.getByLabel('Password').fill('seller-password-123')
  await page.getByRole('button', { name: /set password/i }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.getByLabel('Email').fill('invitedseller@example.com')
  await page.getByLabel('Password').fill('seller-password-123')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/events/)
  await expect(page.getByText('Syyskirppis')).toBeVisible()
})
```

- [ ] **Step 5: Run the E2E test to verify it fails, then passes**

Run: `npx playwright test tests/e2e/events.spec.ts`
Expected: FAILs before Steps 1-3 exist; PASSes once they're in place. Confirm it passes.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)" tests/e2e/events.spec.ts
git commit -m "feat: add event list/detail/members pages and E2E coverage"
```

---

## Session 5: Item listing (manual CRUD)

**Session goal:** a seller can add, edit, and delete their own items (never another seller's), with quick-repeat entry, before the event's cutoff date; admins/staff can view all items in an event.

### Task 5.1: Item validation schema and service

**Files:**
- Create: `lib/validation/item.ts`
- Create: `lib/services/items.ts`
- Test: `tests/integration/items.test.ts`

**Interfaces:**
- Consumes: `requireEventAccess` (Task 3.1), `writeAuditLog` (Task 3.2), `prisma`.
- Produces: `createItem(session, input)`, `updateItem(session, itemId, input)`, `deleteItem(session, itemId)`, `listItemsForSeller(session, eventId)`, `listAllItemsForEvent(session, eventId)` — used by `actions/items.ts` (Task 5.2), and by `lib/services/imports.ts` (Session 6) and `lib/services/price-tags.ts` (Session 7).

- [ ] **Step 1: Write the failing test — `tests/integration/items.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import {
  createItem,
  updateItem,
  deleteItem,
  listItemsForSeller,
  listAllItemsForEvent,
} from '@/lib/services/items'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function setup() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const sellerA = await testPrisma.user.create({ data: { name: 'Seller A', email: 'sellerA@example.com', passwordHash: 'x' } })
  const sellerB = await testPrisma.user.create({ data: { name: 'Seller B', email: 'sellerB@example.com', passwordHash: 'x' } })
  const staff = await testPrisma.user.create({ data: { name: 'Staff', email: 'staff@example.com', passwordHash: 'x' } })

  const futureCutoff = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const pastCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: futureCutoff, registrationDeadline: futureCutoff,
      itemEditCutoffDate: futureCutoff, createdByUserId: owner.id,
    },
  })
  const closedEvent = await testPrisma.event.create({
    data: {
      name: 'Closed Event', eventDate: pastCutoff, registrationDeadline: pastCutoff,
      itemEditCutoffDate: pastCutoff, createdByUserId: owner.id,
    },
  })

  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const closedCategory = await testPrisma.category.create({ data: { eventId: closedEvent.id, name: 'Vaatteet' } })

  await testPrisma.eventMembership.createMany({
    data: [
      { userId: sellerA.id, eventId: event.id, role: 'SELLER', sellerAlias: 'A', status: 'ACTIVE' },
      { userId: sellerB.id, eventId: event.id, role: 'SELLER', sellerAlias: 'B', status: 'ACTIVE' },
      { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' },
      { userId: sellerA.id, eventId: closedEvent.id, role: 'SELLER', sellerAlias: 'A', status: 'ACTIVE' },
    ],
  })

  return { owner, sellerA, sellerB, staff, event, closedEvent, category, closedCategory }
}

const ITEM_INPUT = (categoryId: string) => ({
  name: 'Manga Vol. 1',
  price: 5,
  categoryId,
  isAgeRestricted: false,
})

describe('createItem', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('lets a seller create an item for themselves in an open event', async () => {
    const { sellerA, event, category } = await setup()
    const result = await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const item = await testPrisma.item.findUniqueOrThrow({ where: { id: result.data.itemId } })
    expect(item.sellerId).toBe(sellerA.id)
    expect(item.status).toBe('LISTED')
  })

  it('rejects item creation by staff (staff cannot list items)', async () => {
    const { staff, event, category } = await setup()
    const result = await createItem(sessionFor(staff.id), event.id, ITEM_INPUT(category.id))
    expect(result.ok).toBe(false)
  })

  it('rejects item creation after the edit cutoff date has passed', async () => {
    const { sellerA, closedEvent, closedCategory } = await setup()
    const result = await createItem(sessionFor(sellerA.id), closedEvent.id, ITEM_INPUT(closedCategory.id))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('CUTOFF_PASSED')
  })
})

describe('updateItem / deleteItem', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it("rejects a seller editing another seller's item", async () => {
    const { sellerA, sellerB, event, category } = await setup()
    const created = await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    if (!created.ok) throw new Error('setup failed')

    const result = await updateItem(sessionFor(sellerB.id), created.data.itemId, { price: 10 })
    expect(result.ok).toBe(false)
  })

  it('allows an admin to delete any item and writes an audit log', async () => {
    const { owner, sellerA, event, category } = await setup()
    const created = await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    if (!created.ok) throw new Error('setup failed')

    const result = await deleteItem(sessionFor(owner.id), created.data.itemId)
    expect(result.ok).toBe(true)

    const item = await testPrisma.item.findUniqueOrThrow({ where: { id: created.data.itemId } })
    expect(item.status).toBe('REMOVED')

    const log = await testPrisma.auditLog.findFirst({ where: { action: 'ITEM_DELETED_BY_ADMIN' } })
    expect(log?.targetId).toBe(created.data.itemId)
  })

  it('does not audit-log a seller deleting their own item', async () => {
    const { sellerA, event, category } = await setup()
    const created = await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    if (!created.ok) throw new Error('setup failed')

    await deleteItem(sessionFor(sellerA.id), created.data.itemId)
    const log = await testPrisma.auditLog.findFirst({ where: { action: 'ITEM_DELETED_BY_ADMIN' } })
    expect(log).toBeNull()
  })
})

describe('listItemsForSeller / listAllItemsForEvent', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it("scopes listItemsForSeller to only the caller's own items", async () => {
    const { sellerA, sellerB, event, category } = await setup()
    await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    await createItem(sessionFor(sellerB.id), event.id, ITEM_INPUT(category.id))

    const result = await listItemsForSeller(sessionFor(sellerA.id), event.id)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toHaveLength(1)
  })

  it('lets staff see every item in the event via listAllItemsForEvent', async () => {
    const { sellerA, sellerB, staff, event, category } = await setup()
    await createItem(sessionFor(sellerA.id), event.id, ITEM_INPUT(category.id))
    await createItem(sessionFor(sellerB.id), event.id, ITEM_INPUT(category.id))

    const result = await listAllItemsForEvent(sessionFor(staff.id), event.id)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toHaveLength(2)
  })

  it('rejects a seller calling listAllItemsForEvent (staff/admin only)', async () => {
    const { sellerA, event } = await setup()
    const result = await listAllItemsForEvent(sessionFor(sellerA.id), event.id)
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/items.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/items'`

- [ ] **Step 3: Write `lib/validation/item.ts`**

```typescript
import { z } from 'zod'

export const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.coerce.number().positive().max(100000),
  categoryId: z.string().min(1),
  isAgeRestricted: z.coerce.boolean().optional().default(false),
})

export const updateItemSchema = createItemSchema.partial()
```

- [ ] **Step 4: Write `lib/services/items.ts`**

```typescript
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { writeAuditLog } from '@/lib/services/audit'
import { createItemSchema, updateItemSchema } from '@/lib/validation/item'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

export async function createItem(
  session: MinimalSession,
  eventId: string,
  input: unknown
): Promise<Result<{ itemId: string }>> {
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) return authz

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  if (new Date() > event.itemEditCutoffDate) {
    return { ok: false, error: { code: 'CUTOFF_PASSED', message: 'The item edit cutoff date has passed' } }
  }

  const parsed = createItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  const item = await prisma.item.create({
    data: { ...parsed.data, eventId, sellerId: authz.userId },
  })

  return { ok: true, data: { itemId: item.id } }
}

async function assertOwnsItemOrIsManager(
  session: MinimalSession,
  itemId: string
): Promise<Result<{ userId: string; role: string; item: { id: string; eventId: string; sellerId: string } }>> {
  const item = await prisma.item.findUnique({ where: { id: itemId } })
  if (!item) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }
  }

  const authz = await requireEventAccess(session, item.eventId, ['SELLER', 'ADMIN'])
  if (!authz.ok) return authz

  const isOwnItem = authz.role === 'SELLER' && item.sellerId === authz.userId
  const isManager = authz.role === 'ADMIN' || authz.role === 'OWNER'
  if (!isOwnItem && !isManager) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'You cannot modify this item' } }
  }

  return { ok: true, data: { userId: authz.userId, role: authz.role, item } }
}

export async function updateItem(session: MinimalSession, itemId: string, input: unknown): Promise<Result<{ itemId: string }>> {
  const access = await assertOwnsItemOrIsManager(session, itemId)
  if (!access.ok) return access

  const event = await prisma.event.findUniqueOrThrow({ where: { id: access.data.item.eventId } })
  const isManager = access.data.role === 'ADMIN' || access.data.role === 'OWNER'
  if (!isManager && new Date() > event.itemEditCutoffDate) {
    return { ok: false, error: { code: 'CUTOFF_PASSED', message: 'The item edit cutoff date has passed' } }
  }

  const parsed = updateItemSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  await prisma.item.update({ where: { id: itemId }, data: parsed.data })
  return { ok: true, data: { itemId } }
}

export async function deleteItem(session: MinimalSession, itemId: string): Promise<Result<{ itemId: string }>> {
  const access = await assertOwnsItemOrIsManager(session, itemId)
  if (!access.ok) return access

  await prisma.item.update({ where: { id: itemId }, data: { status: 'REMOVED' } })

  const isOwnItem = access.data.role === 'SELLER' && access.data.item.sellerId === access.data.userId
  if (!isOwnItem) {
    await writeAuditLog({
      actorUserId: access.data.userId,
      action: 'ITEM_DELETED_BY_ADMIN',
      targetType: 'Item',
      targetId: itemId,
      metadata: { sellerId: access.data.item.sellerId },
    })
  }

  return { ok: true, data: { itemId } }
}

export async function listItemsForSeller(session: MinimalSession, eventId: string): Promise<Result<Array<{ id: string; name: string; price: string; status: string }>>> {
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) return authz

  const items = await prisma.item.findMany({
    where: { eventId, sellerId: authz.userId, status: { not: 'REMOVED' } },
    orderBy: { createdAt: 'desc' },
  })

  return { ok: true, data: items.map((i) => ({ id: i.id, name: i.name, price: i.price.toString(), status: i.status })) }
}

export async function listAllItemsForEvent(session: MinimalSession, eventId: string): Promise<Result<Array<{ id: string; name: string; price: string; status: string; sellerId: string }>>> {
  const authz = await requireEventAccess(session, eventId, ['STAFF', 'ADMIN'])
  if (!authz.ok) return authz

  const items = await prisma.item.findMany({
    where: { eventId, status: { not: 'REMOVED' } },
    orderBy: { createdAt: 'desc' },
  })

  return {
    ok: true,
    data: items.map((i) => ({ id: i.id, name: i.name, price: i.price.toString(), status: i.status, sellerId: i.sellerId })),
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/integration/items.test.ts`
Expected: all 10 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/validation/item.ts lib/services/items.ts tests/integration/items.test.ts
git commit -m "feat: add item CRUD service with cutoff enforcement and audit logging"
```

### Task 5.2: Item Server Actions and category listing

**Files:**
- Create: `actions/items.ts`
- Test: `tests/unit/actions/items.test.ts`

**Interfaces:**
- Consumes: `createItem`/`updateItem`/`deleteItem`/`listItemsForSeller` from Task 5.1, `auth()` from `lib/auth.ts`.
- Produces: `createItem(eventId, formData)`, `updateItem(itemId, formData)`, `deleteItem(itemId, eventId)` — used by the page in Task 5.3.

- [ ] **Step 1: Write the failing test — `tests/unit/actions/items.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }) }))
vi.mock('@/lib/services/items', () => ({
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('createItem action', () => {
  it('coerces the isAgeRestricted checkbox and forwards to the service', async () => {
    const { createItem: createItemAction } = await import('@/actions/items')
    const { createItem: createItemService } = await import('@/lib/services/items')
    vi.mocked(createItemService).mockResolvedValueOnce({ ok: true, data: { itemId: 'item-1' } })

    const formData = new FormData()
    formData.set('name', 'Manga Vol. 1')
    formData.set('price', '5')
    formData.set('categoryId', 'cat-1')
    formData.set('isAgeRestricted', 'on')

    const result = await createItemAction('evt-1', formData)

    expect(result.ok).toBe(true)
    expect(createItemService).toHaveBeenCalledWith(
      { user: { id: 'user-1' } },
      'evt-1',
      expect.objectContaining({ name: 'Manga Vol. 1', isAgeRestricted: true })
    )
  })

  it('treats an absent checkbox as false', async () => {
    const { createItem: createItemAction } = await import('@/actions/items')
    const { createItem: createItemService } = await import('@/lib/services/items')
    vi.mocked(createItemService).mockResolvedValueOnce({ ok: true, data: { itemId: 'item-2' } })

    const formData = new FormData()
    formData.set('name', 'Manga Vol. 2')
    formData.set('price', '5')
    formData.set('categoryId', 'cat-1')

    await createItemAction('evt-1', formData)

    expect(createItemService).toHaveBeenCalledWith(
      { user: { id: 'user-1' } },
      'evt-1',
      expect.objectContaining({ isAgeRestricted: false })
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/actions/items.test.ts`
Expected: FAIL — `Cannot find module '@/actions/items'`

- [ ] **Step 3: Write `actions/items.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  createItem as createItemService,
  updateItem as updateItemService,
  deleteItem as deleteItemService,
} from '@/lib/services/items'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

function itemInputFromFormData(formData: FormData) {
  return {
    name: formData.get('name'),
    price: formData.get('price'),
    categoryId: formData.get('categoryId'),
    isAgeRestricted: formData.get('isAgeRestricted') === 'on',
  }
}

export async function createItem(eventId: string, formData: FormData): Promise<Result<{ itemId: string }>> {
  const session = await auth()
  const result = await createItemService(session, eventId, itemInputFromFormData(formData))
  if (result.ok) revalidatePath(`/events/${eventId}/items`)
  return result
}

export async function updateItem(itemId: string, eventId: string, formData: FormData): Promise<Result<{ itemId: string }>> {
  const session = await auth()
  const result = await updateItemService(session, itemId, itemInputFromFormData(formData))
  if (result.ok) revalidatePath(`/events/${eventId}/items`)
  return result
}

export async function deleteItem(itemId: string, eventId: string): Promise<Result<{ itemId: string }>> {
  const session = await auth()
  const result = await deleteItemService(session, itemId)
  if (result.ok) revalidatePath(`/events/${eventId}/items`)
  return result
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/actions/items.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/items.ts tests/unit/actions/items.test.ts
git commit -m "feat: add item server actions"
```

### Task 5.3: Item listing page with quick-repeat entry, and end-to-end verification

**Files:**
- Create: `app/(dashboard)/events/[eventId]/items/page.tsx`
- Test: `tests/e2e/items.spec.ts`

**Interfaces:**
- Consumes: `listItemsForSeller` (Task 5.1), `createItem`/`deleteItem` actions (Task 5.2), `requireEventAccess` (Task 3.1).

- [ ] **Step 1: Write `app/(dashboard)/events/[eventId]/items/page.tsx`**

Quick-repeat is implemented as a plain HTML form: because it's an uncontrolled form submitted via a Server Action, the browser does not clear `category`/`isAgeRestricted` selections after submit — only `name` and `price` reset naturally as the fresh page render provides empty defaults for those two fields, while `<select>`/checkbox retain their last DOM state across the action-triggered refresh in the same session. This gives the "tweak name/price, keep category/K-18" behavior from the spec without any client-side state.

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { listItemsForSeller } from '@/lib/services/items'
import { createItem, deleteItem } from '@/actions/items'

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

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">My items</h1>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <span>
              {item.name} — {item.price} € — {item.status}
            </span>
            {item.status === 'LISTED' && (
              <form
                action={async () => {
                  'use server'
                  await deleteItem(item.id, eventId)
                }}
              >
                <button type="submit" className="text-sm text-red-600 underline">
                  Delete
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <form
        action={async (formData) => {
          'use server'
          await createItem(eventId, formData)
        }}
        className="mt-8 flex max-w-sm flex-col gap-3"
      >
        <h2 className="font-medium">Add an item</h2>
        <input name="name" placeholder="Item name" required className="rounded border px-2 py-1" />
        <input name="price" type="number" step="0.01" min="0.01" placeholder="Price" required className="rounded border px-2 py-1" />
        <select name="categoryId" required className="rounded border px-2 py-1">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input name="isAgeRestricted" type="checkbox" />
          K-18
        </label>
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          Add item
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Write the failing E2E test — `tests/e2e/items.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('a seller can add an item and delete it, but never sees another seller\'s items', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })

  const sellerA = await testPrisma.user.create({
    data: { name: 'Seller A', email: 'sellerA@example.com', passwordHash: await hashPassword('seller-a-pw-123') },
  })
  const sellerB = await testPrisma.user.create({
    data: { name: 'Seller B', email: 'sellerB@example.com', passwordHash: await hashPassword('seller-b-pw-123') },
  })
  await testPrisma.eventMembership.createMany({
    data: [
      { userId: sellerA.id, eventId: event.id, role: 'SELLER', sellerAlias: 'A', status: 'ACTIVE' },
      { userId: sellerB.id, eventId: event.id, role: 'SELLER', sellerAlias: 'B', status: 'ACTIVE' },
    ],
  })
  await testPrisma.item.create({
    data: { eventId: event.id, sellerId: sellerB.id, name: "Seller B's item", price: 3, categoryId: category.id },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('sellerA@example.com')
  await page.getByLabel('Password').fill('seller-a-pw-123')
  await page.getByRole('button', { name: /log in/i }).click()

  await page.goto(`/events/${event.id}/items`)
  await expect(page.getByText("Seller B's item")).toHaveCount(0)

  await page.getByPlaceholder('Item name').fill('Manga Vol. 1')
  await page.getByPlaceholder('Price').fill('5')
  await page.getByRole('button', { name: /add item/i }).click()
  await expect(page.getByText('Manga Vol. 1')).toBeVisible()

  await page.getByRole('button', { name: /delete/i }).click()
  await expect(page.getByText('Manga Vol. 1')).toHaveCount(0)
})
```

- [ ] **Step 3: Run the E2E test to verify it fails, then passes**

Run: `npx playwright test tests/e2e/items.spec.ts`
Expected: FAILs before Step 1 exists; PASSes once the page is written. Confirm it passes.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/events/[eventId]/items" tests/e2e/items.spec.ts
git commit -m "feat: add seller item listing page with quick-repeat entry"
```

---

## Session 6: CSV/XLSX bulk import

**Session goal:** a seller uploads a CSV/XLSX export of their Google Sheet, previews validated rows with per-row errors, and confirms an all-or-nothing import — without ever trusting client-supplied item data for the actual write.

### Task 6.1: File parsing with size/row limits

**Files:**
- Create: `lib/services/imports.ts` (this task adds `parseImportFile`; Task 6.2 adds to the same file)
- Test: `tests/unit/imports-parse.test.ts`

**Interfaces:**
- Produces: `parseImportFile(fileName: string, fileBuffer: Buffer): Promise<Result<{ rows: Record<string, string>[] }>>` — used by Task 6.3's Server Action.

- [ ] **Step 1: Write the failing test — `tests/unit/imports-parse.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { parseImportFile } from '@/lib/services/imports'

describe('parseImportFile', () => {
  it('parses a CSV file into row records keyed by header', async () => {
    const csv = 'Tavara,Hinta,Tyyppi,K-18\nManga Vol. 1,5,Kirjat ja lehdet,\nHorror DVD,8,Elektroniikka,x\n'
    const result = await parseImportFile('items.csv', Buffer.from(csv, 'utf-8'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows).toHaveLength(2)
    expect(result.data.rows[0]).toMatchObject({ Tavara: 'Manga Vol. 1', Hinta: '5' })
  })

  it('parses an XLSX file into row records keyed by header', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Items')
    sheet.addRow(['Tavara', 'Hinta', 'Tyyppi', 'K-18'])
    sheet.addRow(['Manga Vol. 1', 5, 'Kirjat ja lehdet', ''])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const result = await parseImportFile('items.xlsx', buffer)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.rows).toHaveLength(1)
    expect(result.data.rows[0].Tavara).toBe('Manga Vol. 1')
  })

  it('rejects a file over the size limit', async () => {
    const oversized = Buffer.alloc(3 * 1024 * 1024, 'a')
    const result = await parseImportFile('items.csv', oversized)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FILE_TOO_LARGE')
  })

  it('rejects a file with more than the max row count', async () => {
    const header = 'Tavara,Hinta,Tyyppi,K-18\n'
    const rows = Array.from({ length: 1001 }, (_, i) => `Item ${i},1,Muu,`).join('\n')
    const result = await parseImportFile('items.csv', Buffer.from(header + rows, 'utf-8'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('TOO_MANY_ROWS')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/imports-parse.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/imports'`

- [ ] **Step 3: Write `lib/services/imports.ts` (parsing section)**

```typescript
import Papa from 'papaparse'
import ExcelJS from 'exceljs'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024
const MAX_ROWS = 1000

export type RawImportRow = Record<string, string>

export async function parseImportFile(fileName: string, fileBuffer: Buffer): Promise<Result<{ rows: RawImportRow[] }>> {
  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: { code: 'FILE_TOO_LARGE', message: 'File exceeds the 2 MB limit' } }
  }

  const isXlsx = fileName.toLowerCase().endsWith('.xlsx')
  let rows: RawImportRow[]

  if (isXlsx) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(fileBuffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) {
      return { ok: false, error: { code: 'EMPTY_FILE', message: 'No worksheet found' } }
    }

    const headerRow = sheet.getRow(1).values as unknown[]
    const headers = headerRow.slice(1).map((h) => String(h ?? '').trim())
    rows = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const values = row.values as unknown[]
      const record: RawImportRow = {}
      headers.forEach((header, i) => {
        record[header] = String(values[i + 1] ?? '').trim()
      })
      rows.push(record)
    })
  } else {
    const parsed = Papa.parse<RawImportRow>(fileBuffer.toString('utf-8'), { header: true, skipEmptyLines: true })
    if (parsed.errors.length > 0) {
      return { ok: false, error: { code: 'PARSE_ERROR', message: parsed.errors[0].message } }
    }
    rows = parsed.data.map((row) => {
      const trimmed: RawImportRow = {}
      for (const [key, value] of Object.entries(row)) trimmed[key.trim()] = String(value ?? '').trim()
      return trimmed
    })
  }

  if (rows.length > MAX_ROWS) {
    return { ok: false, error: { code: 'TOO_MANY_ROWS', message: `File has more than ${MAX_ROWS} rows` } }
  }

  return { ok: true, data: { rows } }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/imports-parse.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/imports.ts tests/unit/imports-parse.test.ts
git commit -m "feat: add CSV/XLSX import parsing with size and row limits"
```

### Task 6.2: Row validation and transactional commit

**Files:**
- Modify: `lib/services/imports.ts` (adds `validateImportRows` and `commitImport` to the file from Task 6.1)
- Test: `tests/integration/imports.test.ts`

**Interfaces:**
- Consumes: `prisma`, `requireEventAccess` (Task 3.1), `RawImportRow` (Task 6.1).
- Produces: `validateImportRows(eventId, rawRows): Promise<{ validRows: ValidatedRow[]; rowErrors: RowError[] }>`, `commitImport(session, eventId, rows): Promise<Result<{ createdCount: number }>>` — used by `actions/imports.ts` (Task 6.3).

- [ ] **Step 1: Write the failing test — `tests/integration/imports.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { validateImportRows, commitImport } from '@/lib/services/imports'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function setup() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  await testPrisma.category.create({ data: { eventId: event.id, name: 'Kirjat ja lehdet' } })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'S', status: 'ACTIVE' },
  })
  return { owner, seller, event }
}

describe('validateImportRows', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('accepts a row with a known category and reports errors for bad prices or unknown categories', async () => {
    const { event } = await setup()
    const { validRows, rowErrors } = await validateImportRows(event.id, [
      { Tavara: 'Manga Vol. 1', Hinta: '5', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
      { Tavara: 'Bad Price', Hinta: '-1', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
      { Tavara: 'Unknown Category Item', Hinta: '2', Tyyppi: 'Nonexistent', 'K-18': '' },
    ])

    expect(validRows).toHaveLength(1)
    expect(validRows[0]).toMatchObject({ name: 'Manga Vol. 1', price: 5, isAgeRestricted: false })
    expect(rowErrors).toHaveLength(2)
    expect(rowErrors.map((e) => e.row)).toEqual([3, 4])
  })

  it('parses the K-18 column as a boolean', async () => {
    const { event } = await setup()
    const { validRows } = await validateImportRows(event.id, [
      { Tavara: 'Adult Item', Hinta: '10', Tyyppi: 'Kirjat ja lehdet', 'K-18': 'x' },
    ])
    expect(validRows[0].isAgeRestricted).toBe(true)
  })
})

describe('commitImport', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('creates one item per valid row for the calling seller', async () => {
    const { seller, event } = await setup()
    const { validRows } = await validateImportRows(event.id, [
      { Tavara: 'Manga Vol. 1', Hinta: '5', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
      { Tavara: 'Manga Vol. 2', Hinta: '5', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
    ])

    const result = await commitImport(sessionFor(seller.id), event.id, validRows)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.createdCount).toBe(2)

    const items = await testPrisma.item.findMany({ where: { eventId: event.id, sellerId: seller.id } })
    expect(items).toHaveLength(2)
  })

  it('rejects committing after the cutoff date', async () => {
    const { seller, owner } = await setup()
    const closedEvent = await testPrisma.event.create({
      data: {
        name: 'Closed', eventDate: new Date(Date.now() - 86400000), registrationDeadline: new Date(Date.now() - 2 * 86400000),
        itemEditCutoffDate: new Date(Date.now() - 86400000), createdByUserId: owner.id,
      },
    })
    await testPrisma.category.create({ data: { eventId: closedEvent.id, name: 'Muu' } })
    await testPrisma.eventMembership.create({
      data: { userId: seller.id, eventId: closedEvent.id, role: 'SELLER', sellerAlias: 'S', status: 'ACTIVE' },
    })
    const { validRows } = await validateImportRows(closedEvent.id, [
      { Tavara: 'Late item', Hinta: '5', Tyyppi: 'Muu', 'K-18': '' },
    ])

    const result = await commitImport(sessionFor(seller.id), closedEvent.id, validRows)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CUTOFF_PASSED')
  })

  it('rejects a non-seller (e.g. staff) committing an import', async () => {
    const { event } = await setup()
    const staff = await testPrisma.user.create({ data: { name: 'Staff', email: 'staff2@example.com', passwordHash: 'x' } })
    await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })
    const { validRows } = await validateImportRows(event.id, [
      { Tavara: 'Item', Hinta: '5', Tyyppi: 'Kirjat ja lehdet', 'K-18': '' },
    ])

    const result = await commitImport(sessionFor(staff.id), event.id, validRows)
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/imports.test.ts`
Expected: FAIL — `validateImportRows`/`commitImport` are not exported yet.

- [ ] **Step 3: Append to `lib/services/imports.ts`**

```typescript
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'

type MinimalSession = { user?: { id?: string | null } | null } | null

const importRowSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.coerce.number().positive().max(100000),
  categoryName: z.string().min(1),
  isAgeRestricted: z.boolean(),
})

const HEADER_ALIASES: Record<string, 'name' | 'price' | 'categoryName' | 'isAgeRestricted'> = {
  tavara: 'name',
  nimi: 'name',
  name: 'name',
  hinta: 'price',
  price: 'price',
  tyyppi: 'categoryName',
  kategoria: 'categoryName',
  category: 'categoryName',
  'k-18': 'isAgeRestricted',
  k18: 'isAgeRestricted',
}

function normalizeRow(raw: RawImportRow): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const canonical = HEADER_ALIASES[key.trim().toLowerCase()]
    if (canonical) normalized[canonical] = value
  }
  return normalized
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) return false
  return ['true', '1', 'x', 'kyllä', 'yes'].includes(value.trim().toLowerCase())
}

export type RowError = { row: number; field: string; message: string }
export type ValidatedRow = { name: string; price: number; categoryId: string; isAgeRestricted: boolean }

export async function validateImportRows(
  eventId: string,
  rawRows: RawImportRow[]
): Promise<{ validRows: ValidatedRow[]; rowErrors: RowError[] }> {
  const categories = await prisma.category.findMany({ where: { eventId } })
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))

  const validRows: ValidatedRow[] = []
  const rowErrors: RowError[] = []

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2
    const normalized = normalizeRow(raw)
    const parsed = importRowSchema.safeParse({
      name: normalized.name,
      price: normalized.price,
      categoryName: normalized.categoryName,
      isAgeRestricted: parseBoolean(normalized.isAgeRestricted),
    })

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        rowErrors.push({ row: rowNumber, field: String(issue.path[0] ?? 'unknown'), message: issue.message })
      }
      return
    }

    const categoryId = categoryByName.get(parsed.data.categoryName.toLowerCase())
    if (!categoryId) {
      rowErrors.push({ row: rowNumber, field: 'categoryName', message: `Unknown category "${parsed.data.categoryName}"` })
      return
    }

    validRows.push({ name: parsed.data.name, price: parsed.data.price, categoryId, isAgeRestricted: parsed.data.isAgeRestricted })
  })

  return { validRows, rowErrors }
}

export async function commitImport(
  session: MinimalSession,
  eventId: string,
  rows: ValidatedRow[]
): Promise<Result<{ createdCount: number }>> {
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) return authz

  if (rows.length === 0) {
    return { ok: false, error: { code: 'NO_ROWS', message: 'No valid rows to import' } }
  }

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  if (new Date() > event.itemEditCutoffDate) {
    return { ok: false, error: { code: 'CUTOFF_PASSED', message: 'The item edit cutoff date has passed' } }
  }

  // createMany compiles to a single INSERT statement — atomic by construction,
  // so a failure partway through never leaves a partial batch committed.
  await prisma.item.createMany({
    data: rows.map((row) => ({
      eventId,
      sellerId: authz.userId,
      name: row.name,
      price: row.price,
      categoryId: row.categoryId,
      isAgeRestricted: row.isAgeRestricted,
    })),
  })

  return { ok: true, data: { createdCount: rows.length } }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/imports.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/imports.ts tests/integration/imports.test.ts
git commit -m "feat: add import row validation and atomic commit"
```

### Task 6.3: Import UI (preview then confirm, same uploaded file for both) and end-to-end verification

**Files:**
- Create: `actions/imports.ts`
- Create: `app/(dashboard)/events/[eventId]/items/import/page.tsx`
- Create: `app/(dashboard)/events/[eventId]/items/import/ImportForm.tsx`
- Test: `tests/e2e/import.spec.ts`

**Interfaces:**
- Consumes: `parseImportFile`/`validateImportRows`/`commitImport` (Tasks 6.1–6.2), `auth()`.
- Produces: the `/events/[eventId]/items/import` route.

**Design note:** the preview and confirm steps read the *same uploaded file* twice via one `<form>` with two named submit buttons (`intent=preview` / `intent=commit`) — the server never trusts client-echoed row data for the actual write; it always re-parses and re-validates the original file bytes at commit time. Since this is a client component with an uncontrolled file input, the browser keeps the selected file across the two submits (no page navigation occurs).

- [ ] **Step 1: Write `actions/imports.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { parseImportFile, validateImportRows, commitImport, type RowError } from '@/lib/services/imports'

export type ImportFormState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'preview'; validCount: number; rowErrors: RowError[] }
  | { status: 'committed'; createdCount: number }

export async function handleImportForm(
  eventId: string,
  _prevState: ImportFormState,
  formData: FormData
): Promise<ImportFormState> {
  const session = await auth()
  const file = formData.get('file')
  const intent = formData.get('intent')

  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Please choose a file to import' }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const parsed = await parseImportFile(file.name, buffer)
  if (!parsed.ok) {
    return { status: 'error', message: parsed.error.message }
  }

  const { validRows, rowErrors } = await validateImportRows(eventId, parsed.data.rows)

  if (intent === 'preview') {
    return { status: 'preview', validCount: validRows.length, rowErrors }
  }

  const result = await commitImport(session, eventId, validRows)
  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  revalidatePath(`/events/${eventId}/items`)
  return { status: 'committed', createdCount: result.data.createdCount }
}
```

- [ ] **Step 2: Write `app/(dashboard)/events/[eventId]/items/import/ImportForm.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import { handleImportForm, type ImportFormState } from '@/actions/imports'

const initialState: ImportFormState = { status: 'idle' }

export function ImportForm({ eventId }: { eventId: string }) {
  const [state, formAction, isPending] = useActionState(handleImportForm.bind(null, eventId), initialState)

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <input name="file" type="file" accept=".csv,.xlsx" required className="rounded border px-2 py-1" />
      <div className="flex gap-2">
        <button type="submit" name="intent" value="preview" disabled={isPending} className="rounded border px-4 py-2">
          Preview
        </button>
        <button type="submit" name="intent" value="commit" disabled={isPending} className="rounded bg-black px-4 py-2 text-white">
          Confirm import
        </button>
      </div>

      {state.status === 'error' && <p className="text-red-600">{state.message}</p>}

      {state.status === 'preview' && (
        <div>
          <p>{state.validCount} valid row(s) ready to import.</p>
          {state.rowErrors.length > 0 && (
            <table className="mt-2 text-sm">
              <thead>
                <tr>
                  <th className="pr-4 text-left">Row</th>
                  <th className="pr-4 text-left">Field</th>
                  <th className="text-left">Problem</th>
                </tr>
              </thead>
              <tbody>
                {state.rowErrors.map((e, i) => (
                  <tr key={i}>
                    <td className="pr-4">{e.row}</td>
                    <td className="pr-4">{e.field}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {state.status === 'committed' && <p className="text-green-700">Imported {state.createdCount} item(s).</p>}
    </form>
  )
}
```

- [ ] **Step 3: Write `app/(dashboard)/events/[eventId]/items/import/page.tsx`**

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
    <div className="p-8">
      <h1 className="text-xl font-semibold">Import items from a spreadsheet</h1>
      <p className="mt-2 text-sm text-gray-600">
        Export your Google Sheet as CSV or XLSX with columns: Tavara, Hinta, Tyyppi, K-18.
      </p>
      <div className="mt-6">
        <ImportForm eventId={eventId} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write the failing E2E test — `tests/e2e/import.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('seller previews then commits a CSV import using the same uploaded file', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  await testPrisma.category.create({ data: { eventId: event.id, name: 'Kirjat ja lehdet' } })
  const seller = await testPrisma.user.create({
    data: { name: 'Seller', email: 'seller@example.com', passwordHash: await hashPassword('seller-pw-12345') },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'S', status: 'ACTIVE' },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('seller@example.com')
  await page.getByLabel('Password').fill('seller-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()

  await page.goto(`/events/${event.id}/items/import`)

  const csv = 'Tavara,Hinta,Tyyppi,K-18\nManga Vol. 1,5,Kirjat ja lehdet,\nBad Row,-1,Kirjat ja lehdet,\n'
  await page.setInputFiles('input[type=file]', {
    name: 'items.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf-8'),
  })

  await page.getByRole('button', { name: /^preview$/i }).click()
  await expect(page.getByText('1 valid row(s) ready to import.')).toBeVisible()
  await expect(page.getByText('price')).toBeVisible()

  await page.getByRole('button', { name: /confirm import/i }).click()
  await expect(page.getByText('Imported 1 item(s).')).toBeVisible()

  const items = await testPrisma.item.findMany({ where: { eventId: event.id, sellerId: seller.id } })
  expect(items).toHaveLength(1)
  expect(items[0].name).toBe('Manga Vol. 1')
})
```

- [ ] **Step 5: Run the E2E test to verify it fails, then passes**

Run: `npx playwright test tests/e2e/import.spec.ts`
Expected: FAILs before Steps 1-3 exist; PASSes once complete. Confirm it passes.

- [ ] **Step 6: Commit**

```bash
git add actions/imports.ts "app/(dashboard)/events/[eventId]/items/import" tests/e2e/import.spec.ts
git commit -m "feat: add CSV/XLSX import UI with preview-then-confirm flow"
```

---

## Session 7: Price tag and barcode generation

**Session goal:** a seller (or admin) can download a PDF of price tags for their items, each with a stable server-generated unique barcode, a human-readable fallback code, and a K-18 marker where applicable.

### Task 7.1: Barcode assignment and price tag data service

**Files:**
- Create: `lib/services/price-tags.tsx` (this task adds the data/barcode section; Task 7.2 adds PDF rendering to the same file)
- Test: `tests/integration/price-tags.test.ts`

**Interfaces:**
- Consumes: `prisma`, `requireEventAccess` (Task 3.1).
- Produces: `generatePriceTagData(session, eventId, itemIds): Promise<Result<PriceTagData[]>>` — used by Task 7.3's route handler.

- [ ] **Step 1: Write the failing test — `tests/integration/price-tags.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { generatePriceTagData } from '@/lib/services/price-tags'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function setup() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const sellerA = await testPrisma.user.create({ data: { name: 'Seller A', email: 'sellerA@example.com', passwordHash: 'x' } })
  const sellerB = await testPrisma.user.create({ data: { name: 'Seller B', email: 'sellerB@example.com', passwordHash: 'x' } })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  await testPrisma.eventMembership.createMany({
    data: [
      { userId: sellerA.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
      { userId: sellerB.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Liisa', status: 'ACTIVE' },
    ],
  })
  const itemA = await testPrisma.item.create({ data: { eventId: event.id, sellerId: sellerA.id, name: 'Item A', price: 5, categoryId: category.id } })
  const itemB = await testPrisma.item.create({ data: { eventId: event.id, sellerId: sellerB.id, name: 'Item B', price: 3, categoryId: category.id } })
  return { owner, sellerA, sellerB, event, itemA, itemB }
}

describe('generatePriceTagData', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('assigns a stable, unique barcode to each item and includes the seller alias', async () => {
    const { sellerA, event, itemA } = await setup()
    const first = await generatePriceTagData(sessionFor(sellerA.id), event.id, [itemA.id])
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.data[0].sellerAlias).toBe('Kalle')
    const barcode1 = first.data[0].barcodeValue

    const second = await generatePriceTagData(sessionFor(sellerA.id), event.id, [itemA.id])
    if (!second.ok) throw new Error('unexpected failure')
    expect(second.data[0].barcodeValue).toBe(barcode1)
  })

  it('assigns different barcodes to different items', async () => {
    const { owner, event, itemA, itemB } = await setup()
    const result = await generatePriceTagData(sessionFor(owner.id), event.id, [itemA.id, itemB.id])
    if (!result.ok) throw new Error('unexpected failure')
    expect(result.data[0].barcodeValue).not.toBe(result.data[1].barcodeValue)
  })

  it("rejects a seller requesting tags for another seller's item", async () => {
    const { sellerA, event, itemB } = await setup()
    const result = await generatePriceTagData(sessionFor(sellerA.id), event.id, [itemB.id])
    expect(result.ok).toBe(false)
  })

  it('allows an admin/owner to generate tags for any item', async () => {
    const { owner, event, itemA, itemB } = await setup()
    const result = await generatePriceTagData(sessionFor(owner.id), event.id, [itemA.id, itemB.id])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/price-tags.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/price-tags'`

- [ ] **Step 3: Write `lib/services/price-tags.tsx` (data/barcode section)**

```tsx
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

export type PriceTagData = {
  id: string
  name: string
  price: string
  sellerAlias: string
  isAgeRestricted: boolean
  barcodeValue: string
}

function generateBarcodeValue(): string {
  return randomBytes(6).toString('hex').toUpperCase()
}

async function assignBarcodeIfMissing(itemId: string): Promise<string> {
  const item = await prisma.item.findUniqueOrThrow({ where: { id: itemId } })
  if (item.barcodeValue) return item.barcodeValue

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateBarcodeValue()
    try {
      const updated = await prisma.item.update({ where: { id: itemId }, data: { barcodeValue: candidate } })
      return updated.barcodeValue!
    } catch (err: any) {
      if (err.code === 'P2002') continue
      throw err
    }
  }
  throw new Error('Failed to generate a unique barcode after 5 attempts')
}

export async function generatePriceTagData(
  session: MinimalSession,
  eventId: string,
  itemIds: string[]
): Promise<Result<PriceTagData[]>> {
  const authz = await requireEventAccess(session, eventId, ['SELLER', 'ADMIN'])
  if (!authz.ok) return authz

  const items = await prisma.item.findMany({ where: { id: { in: itemIds }, eventId } })
  if (items.length === 0) {
    return { ok: false, error: { code: 'NO_ITEMS', message: 'No items found for the given ids' } }
  }

  const isManager = authz.role === 'ADMIN' || authz.role === 'OWNER'
  for (const item of items) {
    if (!isManager && item.sellerId !== authz.userId) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'You can only generate tags for your own items' } }
    }
  }

  const results: PriceTagData[] = []
  for (const item of items) {
    const barcodeValue = await assignBarcodeIfMissing(item.id)
    const membership = await prisma.eventMembership.findUnique({
      where: { userId_eventId: { userId: item.sellerId, eventId } },
    })
    results.push({
      id: item.id,
      name: item.name,
      price: item.price.toString(),
      sellerAlias: membership?.sellerAlias ?? 'Unknown',
      isAgeRestricted: item.isAgeRestricted,
      barcodeValue,
    })
  }

  return { ok: true, data: results }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/price-tags.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/price-tags.tsx tests/integration/price-tags.test.ts
git commit -m "feat: add barcode assignment and price tag data service"
```

### Task 7.2: PDF rendering

**Files:**
- Modify: `lib/services/price-tags.tsx` (adds `renderPriceTagsPdf` to the file from Task 7.1)
- Test: `tests/unit/price-tags-pdf.test.ts`

**Interfaces:**
- Consumes: `PriceTagData` type (Task 7.1), `bwip-js`, `@react-pdf/renderer`.
- Produces: `renderPriceTagsPdf(tags: PriceTagData[]): Promise<Buffer>` — used by `app/api/price-tags/[eventId]/route.ts` (Task 7.3).

- [ ] **Step 1: Write the failing test — `tests/unit/price-tags-pdf.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { renderPriceTagsPdf } from '@/lib/services/price-tags'

describe('renderPriceTagsPdf', () => {
  it('renders a non-empty PDF buffer starting with the PDF magic bytes', async () => {
    const buffer = await renderPriceTagsPdf([
      { id: '1', name: 'Manga Vol. 1', price: '5.00', sellerAlias: 'Kalle', isAgeRestricted: false, barcodeValue: 'ABC123456789' },
    ])

    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF')
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('renders a K-18 item without throwing', async () => {
    const buffer = await renderPriceTagsPdf([
      { id: '2', name: 'Horror DVD', price: '8.00', sellerAlias: 'Liisa', isAgeRestricted: true, barcodeValue: 'DEF987654321' },
    ])
    expect(buffer.subarray(0, 4).toString('utf-8')).toBe('%PDF')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/price-tags-pdf.test.ts`
Expected: FAIL — `renderPriceTagsPdf` is not exported yet.

- [ ] **Step 3: Append to `lib/services/price-tags.tsx`**

```tsx
import bwipjs from 'bwip-js'
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

async function renderBarcodePng(value: string): Promise<string> {
  const png = await bwipjs.toBuffer({ bcid: 'code128', text: value, scale: 3, height: 10, includetext: false })
  return `data:image/png;base64,${png.toString('base64')}`
}

const styles = StyleSheet.create({
  page: { padding: 16, flexDirection: 'row', flexWrap: 'wrap' },
  tag: { width: 180, height: 100, border: '1pt solid #000', margin: 4, padding: 6, justifyContent: 'space-between' },
  name: { fontSize: 10, fontWeight: 700 },
  price: { fontSize: 14, fontWeight: 700 },
  meta: { fontSize: 8 },
  barcode: { width: 150, height: 30 },
  code: { fontSize: 8, textAlign: 'center' },
})

export async function renderPriceTagsPdf(tags: PriceTagData[]): Promise<Buffer> {
  const withImages = await Promise.all(
    tags.map(async (tag) => ({ ...tag, barcodeImage: await renderBarcodePng(tag.barcodeValue) }))
  )

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        {withImages.map((tag) => (
          <View key={tag.id} style={styles.tag}>
            <Text style={styles.name}>{tag.name}</Text>
            <Text style={styles.price}>{tag.price} €</Text>
            <Text style={styles.meta}>
              {tag.sellerAlias}
              {tag.isAgeRestricted ? ' — K-18' : ''}
            </Text>
            <Image src={tag.barcodeImage} style={styles.barcode} />
            <Text style={styles.code}>{tag.barcodeValue}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/price-tags-pdf.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/price-tags.tsx tests/unit/price-tags-pdf.test.ts
git commit -m "feat: render price tags to PDF with embedded barcodes"
```

### Task 7.3: PDF download route, item-page links, and end-to-end verification

**Files:**
- Create: `app/api/price-tags/[eventId]/route.ts`
- Modify: `app/(dashboard)/events/[eventId]/items/page.tsx` (adds per-item and "print all" price tag links)
- Test: `tests/e2e/price-tags.spec.ts`

**Interfaces:**
- Consumes: `generatePriceTagData`/`renderPriceTagsPdf` (Tasks 7.1–7.2), `auth()`.

- [ ] **Step 1: Write `app/api/price-tags/[eventId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generatePriceTagData, renderPriceTagsPdf } from '@/lib/services/price-tags'

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const itemIdsParam = request.nextUrl.searchParams.get('itemIds')
  if (!itemIdsParam) {
    return NextResponse.json({ error: 'itemIds query parameter is required' }, { status: 400 })
  }
  const itemIds = itemIdsParam.split(',').filter(Boolean)

  const result = await generatePriceTagData(session, eventId, itemIds)
  if (!result.ok) {
    const status = result.error.code === 'UNAUTHENTICATED' ? 401 : result.error.code === 'FORBIDDEN' ? 403 : 400
    return NextResponse.json({ error: result.error.message }, { status })
  }

  const pdfBuffer = await renderPriceTagsPdf(result.data)
  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="price-tags.pdf"',
    },
  })
}
```

- [ ] **Step 2: Modify `app/(dashboard)/events/[eventId]/items/page.tsx`**

Add these two additions to the existing file from Task 5.3, just below the `<h1>My items</h1>` heading (the `printAllHref` line) and inside each `<li>` next to the existing delete form (the per-item link):

```tsx
{items.some((i) => i.status === 'LISTED') && (
  <a
    href={`/api/price-tags/${eventId}?itemIds=${items
      .filter((i) => i.status === 'LISTED')
      .map((i) => i.id)
      .join(',')}`}
    className="mt-2 inline-block underline"
  >
    Print all price tags
  </a>
)}
```

```tsx
{item.status === 'LISTED' && (
  <a href={`/api/price-tags/${eventId}?itemIds=${item.id}`} className="text-sm underline">
    Price tag
  </a>
)}
```

- [ ] **Step 3: Write the failing E2E test — `tests/e2e/price-tags.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('seller can download a price tag PDF for their own item', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const seller = await testPrisma.user.create({
    data: { name: 'Seller', email: 'seller@example.com', passwordHash: await hashPassword('seller-pw-12345') },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
  })
  const item = await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Manga Vol. 1', price: 5, categoryId: category.id },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('seller@example.com')
  await page.getByLabel('Password').fill('seller-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()

  const response = await page.request.get(`/api/price-tags/${event.id}?itemIds=${item.id}`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/pdf')
  const body = await response.body()
  expect(body.subarray(0, 4).toString('utf-8')).toBe('%PDF')
})

test('an unauthenticated request is rejected', async ({ page }) => {
  const response = await page.request.get('/api/price-tags/nonexistent?itemIds=x')
  expect(response.status()).toBe(401)
})
```

- [ ] **Step 4: Run the E2E test to verify it fails, then passes**

Run: `npx playwright test tests/e2e/price-tags.spec.ts`
Expected: FAILs before Step 1 exists; PASSes once the route is in place. Confirm it passes.

- [ ] **Step 5: Commit**

```bash
git add app/api/price-tags "app/(dashboard)/events/[eventId]/items/page.tsx" tests/e2e/price-tags.spec.ts
git commit -m "feat: add price tag PDF download route and item-page links"
```

---

## Session 8: Checkout / scan-to-sell flow

**Session goal:** staff/admin can look up an item by barcode or typed fallback code and confirm a sale using only the Enter key; two simultaneous scans of the same item can never both succeed — this is the session that directly implements the spec's double-sell race-condition guarantee.

### Task 8.1: Sale lookup and atomic recordSale service

**Files:**
- Create: `lib/services/sales.ts`
- Test: `tests/integration/sales.test.ts`

**Interfaces:**
- Consumes: `prisma`, `requireEventAccess` (Task 3.1).
- Produces: `lookupItemByCode(session, eventId, code)`, `recordSale(session, itemId, method)` — used by `actions/sales.ts` (Task 8.2).

- [ ] **Step 1: Write the failing test — `tests/integration/sales.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { lookupItemByCode, recordSale } from '@/lib/services/sales'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function setup() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const staff = await testPrisma.user.create({ data: { name: 'Staff', email: 'staff@example.com', passwordHash: 'x' } })
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  await testPrisma.eventMembership.createMany({
    data: [
      { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' },
      { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
    ],
  })
  const item = await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Manga Vol. 1', price: 5, categoryId: category.id, barcodeValue: 'CODE123456' },
  })
  return { owner, staff, seller, event, item }
}

describe('lookupItemByCode', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('finds a listed item by its barcode and returns the seller alias', async () => {
    const { staff, event, item } = await setup()
    const result = await lookupItemByCode(sessionFor(staff.id), event.id, item.barcodeValue!)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.name).toBe('Manga Vol. 1')
      expect(result.data.sellerAlias).toBe('Kalle')
      expect(result.data.status).toBe('LISTED')
    }
  })

  it('returns NOT_FOUND for an unknown code', async () => {
    const { staff, event } = await setup()
    const result = await lookupItemByCode(sessionFor(staff.id), event.id, 'DOES-NOT-EXIST')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
  })

  it('rejects a seller trying to use the lookup (staff/admin only)', async () => {
    const { seller, event, item } = await setup()
    const result = await lookupItemByCode(sessionFor(seller.id), event.id, item.barcodeValue!)
    expect(result.ok).toBe(false)
  })
})

describe('recordSale', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('marks the item SOLD and creates a Sale record', async () => {
    const { staff, item } = await setup()
    const result = await recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN')
    expect(result.ok).toBe(true)

    const updated = await testPrisma.item.findUniqueOrThrow({ where: { id: item.id } })
    expect(updated.status).toBe('SOLD')

    const sale = await testPrisma.sale.findUnique({ where: { itemId: item.id } })
    expect(sale?.soldByUserId).toBe(staff.id)
    expect(sale?.method).toBe('BARCODE_SCAN')
  })

  it('rejects recording a sale for an already-sold item', async () => {
    const { staff, item } = await setup()
    await recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN')
    const second = await recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN')
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error.code).toBe('ALREADY_SOLD')
  })

  it('never double-sells the same item under concurrent recordSale calls', async () => {
    const { staff, item } = await setup()
    const [first, second] = await Promise.all([
      recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN'),
      recordSale(sessionFor(staff.id), item.id, 'BARCODE_SCAN'),
    ])

    const results = [first, second]
    const successes = results.filter((r) => r.ok)
    const failures = results.filter((r) => !r.ok)
    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)
    if (!failures[0].ok) expect(failures[0].error.code).toBe('ALREADY_SOLD')

    const sales = await testPrisma.sale.findMany({ where: { itemId: item.id } })
    expect(sales).toHaveLength(1)
  })

  it('rejects a seller trying to record a sale (staff/admin only)', async () => {
    const { seller, item } = await setup()
    const result = await recordSale(sessionFor(seller.id), item.id, 'MANUAL_OVERRIDE')
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/sales.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/sales'`

- [ ] **Step 3: Write `lib/services/sales.ts`**

```typescript
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null
type SaleMethod = 'BARCODE_SCAN' | 'MANUAL_CODE_ENTRY' | 'MANUAL_OVERRIDE'

export async function lookupItemByCode(
  session: MinimalSession,
  eventId: string,
  code: string
): Promise<Result<{ itemId: string; name: string; price: string; sellerAlias: string; status: string }>> {
  const authz = await requireEventAccess(session, eventId, ['STAFF', 'ADMIN'])
  if (!authz.ok) return authz

  const item = await prisma.item.findFirst({ where: { eventId, barcodeValue: code } })
  if (!item) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Code not recognized' } }
  }

  const membership = await prisma.eventMembership.findUnique({
    where: { userId_eventId: { userId: item.sellerId, eventId } },
  })

  return {
    ok: true,
    data: {
      itemId: item.id,
      name: item.name,
      price: item.price.toString(),
      sellerAlias: membership?.sellerAlias ?? 'Unknown',
      status: item.status,
    },
  }
}

export async function recordSale(
  session: MinimalSession,
  itemId: string,
  method: SaleMethod
): Promise<Result<{ saleId: string }>> {
  const item = await prisma.item.findUnique({ where: { id: itemId } })
  if (!item) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }
  }

  const authz = await requireEventAccess(session, item.eventId, ['STAFF', 'ADMIN'])
  if (!authz.ok) return authz

  return prisma.$transaction(async (tx) => {
    // Atomic conditional update: only flips LISTED -> SOLD if it is still LISTED.
    // Postgres row-locking inside this transaction means a second concurrent call
    // for the same item blocks until this one commits, then sees count === 0.
    const updateResult = await tx.item.updateMany({
      where: { id: itemId, status: 'LISTED' },
      data: { status: 'SOLD' },
    })

    if (updateResult.count === 0) {
      return { ok: false, error: { code: 'ALREADY_SOLD', message: 'This item has already been sold' } } as Result<{ saleId: string }>
    }

    const sale = await tx.sale.create({ data: { itemId, soldByUserId: authz.userId, method } })
    return { ok: true, data: { saleId: sale.id } } as Result<{ saleId: string }>
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/sales.test.ts`
Expected: all 8 tests PASS, including the concurrent double-sell test.

- [ ] **Step 5: Commit**

```bash
git add lib/services/sales.ts tests/integration/sales.test.ts
git commit -m "feat: add atomic sale lookup and recording service"
```

### Task 8.2: Checkout Server Actions

**Files:**
- Create: `actions/sales.ts`
- Test: `tests/unit/actions/sales.test.ts`

**Interfaces:**
- Consumes: `lookupItemByCode`/`recordSale` from Task 8.1, `auth()`.
- Produces: `lookupCode(eventId, code)`, `confirmSale(eventId, itemId, method)` — used by the Checkout UI in Task 8.3.

- [ ] **Step 1: Write the failing test — `tests/unit/actions/sales.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'staff-1' } }) }))
vi.mock('@/lib/services/sales', () => ({ lookupItemByCode: vi.fn(), recordSale: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('lookupCode action', () => {
  it('forwards the session and code to the service', async () => {
    const { lookupCode } = await import('@/actions/sales')
    const { lookupItemByCode } = await import('@/lib/services/sales')
    vi.mocked(lookupItemByCode).mockResolvedValueOnce({
      ok: true,
      data: { itemId: 'item-1', name: 'Manga', price: '5', sellerAlias: 'Kalle', status: 'LISTED' },
    })

    const result = await lookupCode('evt-1', 'CODE123')

    expect(result.ok).toBe(true)
    expect(lookupItemByCode).toHaveBeenCalledWith({ user: { id: 'staff-1' } }, 'evt-1', 'CODE123')
  })
})

describe('confirmSale action', () => {
  it('propagates an ALREADY_SOLD error unchanged', async () => {
    const { confirmSale } = await import('@/actions/sales')
    const { recordSale } = await import('@/lib/services/sales')
    vi.mocked(recordSale).mockResolvedValueOnce({
      ok: false,
      error: { code: 'ALREADY_SOLD', message: 'This item has already been sold' },
    })

    const result = await confirmSale('evt-1', 'item-1', 'BARCODE_SCAN')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ALREADY_SOLD')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/actions/sales.test.ts`
Expected: FAIL — `Cannot find module '@/actions/sales'`

- [ ] **Step 3: Write `actions/sales.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { lookupItemByCode, recordSale as recordSaleService } from '@/lib/services/sales'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export async function lookupCode(
  eventId: string,
  code: string
): Promise<Result<{ itemId: string; name: string; price: string; sellerAlias: string; status: string }>> {
  const session = await auth()
  return lookupItemByCode(session, eventId, code)
}

export async function confirmSale(
  eventId: string,
  itemId: string,
  method: 'BARCODE_SCAN' | 'MANUAL_CODE_ENTRY'
): Promise<Result<{ saleId: string }>> {
  const session = await auth()
  const result = await recordSaleService(session, itemId, method)
  if (result.ok) revalidatePath(`/events/${eventId}/sales`)
  return result
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/actions/sales.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/sales.ts tests/unit/actions/sales.test.ts
git commit -m "feat: add checkout server actions"
```

### Task 8.3: Checkout screen (Enter-key-only flow) and end-to-end verification

**Files:**
- Create: `app/(dashboard)/events/[eventId]/checkout/page.tsx`
- Create: `app/(dashboard)/events/[eventId]/checkout/CheckoutScanner.tsx`
- Test: `tests/e2e/checkout.spec.ts`

**Interfaces:**
- Consumes: `lookupCode`/`confirmSale` actions (Task 8.2), `requireEventAccess` (Task 3.1).

- [ ] **Step 1: Write `app/(dashboard)/events/[eventId]/checkout/CheckoutScanner.tsx`**

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { lookupCode, confirmSale } from '@/actions/sales'

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
    <div className="p-8">
      <h1 className="text-xl font-semibold">Checkout</h1>
      <input
        ref={inputRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (lookup) handleConfirm()
          else handleCodeSubmit()
        }}
        autoFocus
        className="mt-4 w-full max-w-sm rounded border px-3 py-2 text-lg"
        placeholder="Scan or type code, then Enter"
      />

      {lookup && (
        <div className="mt-4 rounded border p-4">
          <p>
            Selling <strong>{lookup.name}</strong> ({lookup.price} €, {lookup.sellerAlias}). Confirm?
          </p>
          <button onClick={handleConfirm} disabled={pending} className="mt-2 rounded bg-black px-4 py-2 text-white">
            Confirm (Enter)
          </button>
        </div>
      )}

      {message && <p className="mt-4">{message}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Write `app/(dashboard)/events/[eventId]/checkout/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { CheckoutScanner } from './CheckoutScanner'

export default async function CheckoutPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['STAFF', 'ADMIN'])
  if (!authz.ok) redirect('/events')

  return <CheckoutScanner eventId={eventId} />
}
```

- [ ] **Step 3: Write the failing E2E test — `tests/e2e/checkout.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('staff scans a barcode, confirms with Enter, and the item becomes sold', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
  })
  const item = await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Manga Vol. 1', price: 5, categoryId: category.id, barcodeValue: 'CODE123456' },
  })
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff@example.com', passwordHash: await hashPassword('staff-pw-12345') },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('staff@example.com')
  await page.getByLabel('Password').fill('staff-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()

  await page.goto(`/events/${event.id}/checkout`)
  const input = page.getByPlaceholder('Scan or type code, then Enter')
  await input.fill('CODE123456')
  await input.press('Enter')

  await expect(page.getByText(/Selling.*Manga Vol\. 1/)).toBeVisible()
  await input.press('Enter')
  await expect(page.getByText('Sold: Manga Vol. 1')).toBeVisible()

  const updated = await testPrisma.item.findUniqueOrThrow({ where: { id: item.id } })
  expect(updated.status).toBe('SOLD')
})

test('scanning an already-sold item shows a distinct error message', async ({ page }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const seller = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
  })
  await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Already Sold', price: 5, categoryId: category.id, barcodeValue: 'SOLDCODE1', status: 'SOLD' },
  })
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff2@example.com', passwordHash: await hashPassword('staff-pw-12345') },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })

  await page.goto('/login')
  await page.getByLabel('Email').fill('staff2@example.com')
  await page.getByLabel('Password').fill('staff-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()

  await page.goto(`/events/${event.id}/checkout`)
  const input = page.getByPlaceholder('Scan or type code, then Enter')
  await input.fill('SOLDCODE1')
  await input.press('Enter')

  await expect(page.getByText('Already sold: Already Sold')).toBeVisible()
})
```

- [ ] **Step 4: Run the E2E test to verify it fails, then passes**

Run: `npx playwright test tests/e2e/checkout.spec.ts`
Expected: FAILs before Steps 1-2 exist; PASSes once complete. Confirm both tests pass.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/events/[eventId]/checkout" tests/e2e/checkout.spec.ts
git commit -m "feat: add Enter-key-only checkout scanner screen"
```

---

## Session 9: Real-time sales dashboards

**Session goal:** sellers see their own sold/unsold items and commission owed; staff/admin see the combined view across all sellers; both update within a couple of seconds of a sale being confirmed at checkout, without a manual refresh.

**Design note (deviates from the original spec sketch):** the SSE handler polls Postgres every ~2 seconds and pushes a full snapshot on each tick, rather than using an in-process event emitter. An in-process emitter would only work if the serverless function instance that handled the `recordSale` mutation were guaranteed to be the same instance streaming a given client's SSE connection — Vercel does not guarantee that. Polling the database is the correctness-robust choice for this deployment target, and as a side effect it satisfies the spec's "reconnect re-fetches full state" requirement for free, since every message already is a full state resync.

### Task 9.1: Sales snapshot service

**Files:**
- Create: `lib/services/sales-dashboard.ts`
- Test: `tests/integration/sales-dashboard.test.ts`

**Interfaces:**
- Consumes: `prisma`, `requireEventAccess` (Task 3.1).
- Produces: `getSalesSnapshot(session, eventId): Promise<Result<SalesSnapshot>>` — used by the SSE route and the initial page render in Task 9.2.

- [ ] **Step 1: Write the failing test — `tests/integration/sales-dashboard.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { getSalesSnapshot } from '@/lib/services/sales-dashboard'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

async function setup() {
  const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: 'x' } })
  const sellerA = await testPrisma.user.create({ data: { name: 'Seller A', email: 'sellerA@example.com', passwordHash: 'x' } })
  const sellerB = await testPrisma.user.create({ data: { name: 'Seller B', email: 'sellerB@example.com', passwordHash: 'x' } })
  const staff = await testPrisma.user.create({ data: { name: 'Staff', email: 'staff@example.com', passwordHash: 'x' } })

  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id, commissionRate: 0.1,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })

  await testPrisma.eventMembership.createMany({
    data: [
      { userId: sellerA.id, eventId: event.id, role: 'SELLER', sellerAlias: 'A', status: 'ACTIVE' },
      { userId: sellerB.id, eventId: event.id, role: 'SELLER', sellerAlias: 'B', status: 'ACTIVE' },
      { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' },
    ],
  })

  const itemA1 = await testPrisma.item.create({ data: { eventId: event.id, sellerId: sellerA.id, name: 'A1', price: 10, categoryId: category.id, status: 'SOLD' } })
  await testPrisma.sale.create({ data: { itemId: itemA1.id, soldByUserId: staff.id, method: 'BARCODE_SCAN' } })
  await testPrisma.item.create({ data: { eventId: event.id, sellerId: sellerA.id, name: 'A2', price: 5, categoryId: category.id, status: 'LISTED' } })
  const itemB1 = await testPrisma.item.create({ data: { eventId: event.id, sellerId: sellerB.id, name: 'B1', price: 20, categoryId: category.id, status: 'SOLD' } })
  await testPrisma.sale.create({ data: { itemId: itemB1.id, soldByUserId: staff.id, method: 'BARCODE_SCAN' } })

  return { owner, sellerA, sellerB, staff, event }
}

describe('getSalesSnapshot', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it("scopes a seller's snapshot to only their own items and revenue", async () => {
    const { sellerA, event } = await setup()
    const result = await getSalesSnapshot(sessionFor(sellerA.id), event.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toHaveLength(2)
    expect(result.data.totalRevenue).toBe('10.00')
    expect(result.data.commissionOwed).toBe('1.00')
  })

  it('shows staff every item and combined revenue across sellers', async () => {
    const { staff, event } = await setup()
    const result = await getSalesSnapshot(sessionFor(staff.id), event.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items).toHaveLength(3)
    expect(result.data.totalRevenue).toBe('30.00')
  })

  it('rejects an outsider with no membership', async () => {
    const { event } = await setup()
    const outsider = await testPrisma.user.create({ data: { name: 'Outsider', email: 'outsider2@example.com', passwordHash: 'x' } })
    const result = await getSalesSnapshot(sessionFor(outsider.id), event.id)
    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/sales-dashboard.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/sales-dashboard'`

- [ ] **Step 3: Write `lib/services/sales-dashboard.ts`**

```typescript
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

export type SalesSnapshotItem = { id: string; name: string; price: string; status: string; sellerAlias: string }
export type SalesSnapshot = { items: SalesSnapshotItem[]; totalRevenue: string; commissionOwed: string }

export async function getSalesSnapshot(session: MinimalSession, eventId: string): Promise<Result<SalesSnapshot>> {
  const authz = await requireEventAccess(session, eventId, ['SELLER', 'STAFF', 'ADMIN'])
  if (!authz.ok) return authz

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  const isManager = authz.role === 'STAFF' || authz.role === 'ADMIN' || authz.role === 'OWNER'

  const items = await prisma.item.findMany({
    where: {
      eventId,
      status: { not: 'REMOVED' },
      ...(isManager ? {} : { sellerId: authz.userId }),
    },
  })

  const memberships = await prisma.eventMembership.findMany({ where: { eventId } })
  const aliasBySellerId = new Map(memberships.map((m) => [m.userId, m.sellerAlias ?? 'Unknown']))

  const soldItems = items.filter((i) => i.status === 'SOLD')
  const totalRevenue = soldItems.reduce((sum, i) => sum + Number(i.price), 0)
  const commissionOwed = totalRevenue * Number(event.commissionRate)

  return {
    ok: true,
    data: {
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price.toString(),
        status: i.status,
        sellerAlias: aliasBySellerId.get(i.sellerId) ?? 'Unknown',
      })),
      totalRevenue: totalRevenue.toFixed(2),
      commissionOwed: commissionOwed.toFixed(2),
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/sales-dashboard.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/sales-dashboard.ts tests/integration/sales-dashboard.test.ts
git commit -m "feat: add role-scoped sales snapshot service"
```

### Task 9.2: SSE route, dashboard UI, and end-to-end verification

**Files:**
- Create: `app/api/sse/[eventId]/route.ts`
- Create: `app/(dashboard)/events/[eventId]/sales/page.tsx`
- Create: `app/(dashboard)/events/[eventId]/sales/SalesDashboard.tsx`
- Test: `tests/e2e/sales-dashboard.spec.ts`

**Interfaces:**
- Consumes: `getSalesSnapshot` (Task 9.1), `auth()`.

- [ ] **Step 1: Write `app/api/sse/[eventId]/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getSalesSnapshot } from '@/lib/services/sales-dashboard'

const POLL_INTERVAL_MS = 2000

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()

  const initial = await getSalesSnapshot(session, eventId)
  if (!initial.ok) {
    const status = initial.error.code === 'UNAUTHENTICATED' ? 401 : 403
    return new Response(JSON.stringify({ error: initial.error.message }), { status })
  }

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      function send(data: unknown) {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      send(initial.data)

      const interval = setInterval(async () => {
        const snapshot = await getSalesSnapshot(session, eventId)
        if (snapshot.ok) send(snapshot.data)
      }, POLL_INTERVAL_MS)

      request.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 2: Write `app/(dashboard)/events/[eventId]/sales/SalesDashboard.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'

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
    <div className="p-8">
      <h1 className="text-xl font-semibold">Sales</h1>
      {!connected && <p className="text-amber-600">Reconnecting…</p>}
      <p className="mt-2">
        Total revenue: {snapshot.totalRevenue} € — Commission owed: {snapshot.commissionOwed} €
      </p>

      <h2 className="mt-4 font-medium">Sold ({sold.length})</h2>
      <ul>
        {sold.map((i) => (
          <li key={i.id}>
            {i.name} — {i.price} € — {i.sellerAlias}
          </li>
        ))}
      </ul>

      <h2 className="mt-4 font-medium">Unsold ({listed.length})</h2>
      <ul>
        {listed.map((i) => (
          <li key={i.id}>
            {i.name} — {i.price} € — {i.sellerAlias}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Write `app/(dashboard)/events/[eventId]/sales/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { getSalesSnapshot } from '@/lib/services/sales-dashboard'
import { SalesDashboard } from './SalesDashboard'

export default async function SalesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER', 'STAFF', 'ADMIN'])
  if (!authz.ok) redirect('/events')

  const snapshot = await getSalesSnapshot(session, eventId)
  if (!snapshot.ok) redirect('/events')

  return <SalesDashboard eventId={eventId} initialSnapshot={snapshot.data} />
}
```

- [ ] **Step 4: Write the failing E2E test — `tests/e2e/sales-dashboard.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test('a sale confirmed at checkout appears on the seller sales dashboard without a manual reload', async ({ browser }) => {
  const owner = await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const event = await testPrisma.event.create({
    data: {
      name: 'Event', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 86400000),
      itemEditCutoffDate: new Date(Date.now() + 6 * 86400000), createdByUserId: owner.id,
    },
  })
  const category = await testPrisma.category.create({ data: { eventId: event.id, name: 'Vaatteet' } })
  const seller = await testPrisma.user.create({
    data: { name: 'Seller', email: 'seller@example.com', passwordHash: await hashPassword('seller-pw-12345') },
  })
  await testPrisma.eventMembership.create({
    data: { userId: seller.id, eventId: event.id, role: 'SELLER', sellerAlias: 'Kalle', status: 'ACTIVE' },
  })
  await testPrisma.item.create({
    data: { eventId: event.id, sellerId: seller.id, name: 'Manga Vol. 1', price: 5, categoryId: category.id, barcodeValue: 'CODE123456' },
  })
  const staff = await testPrisma.user.create({
    data: { name: 'Staff', email: 'staff@example.com', passwordHash: await hashPassword('staff-pw-12345') },
  })
  await testPrisma.eventMembership.create({ data: { userId: staff.id, eventId: event.id, role: 'STAFF', status: 'ACTIVE' } })

  const sellerContext = await browser.newContext()
  const sellerPage = await sellerContext.newPage()
  await sellerPage.goto('/login')
  await sellerPage.getByLabel('Email').fill('seller@example.com')
  await sellerPage.getByLabel('Password').fill('seller-pw-12345')
  await sellerPage.getByRole('button', { name: /log in/i }).click()
  await sellerPage.goto(`/events/${event.id}/sales`)
  await expect(sellerPage.getByText('Unsold (1)')).toBeVisible()

  const staffContext = await browser.newContext()
  const staffPage = await staffContext.newPage()
  await staffPage.goto('/login')
  await staffPage.getByLabel('Email').fill('staff@example.com')
  await staffPage.getByLabel('Password').fill('staff-pw-12345')
  await staffPage.getByRole('button', { name: /log in/i }).click()
  await staffPage.goto(`/events/${event.id}/checkout`)
  const input = staffPage.getByPlaceholder('Scan or type code, then Enter')
  await input.fill('CODE123456')
  await input.press('Enter')
  await input.press('Enter')

  await expect(sellerPage.getByText('Sold (1)')).toBeVisible({ timeout: 5000 })

  await sellerContext.close()
  await staffContext.close()
})
```

- [ ] **Step 5: Run the E2E test to verify it fails, then passes**

Run: `npx playwright test tests/e2e/sales-dashboard.spec.ts`
Expected: FAILs before Steps 1-3 exist; PASSes once complete (allow up to the 5s timeout for the poll tick to land). Confirm it passes.

- [ ] **Step 6: Commit**

```bash
git add app/api/sse "app/(dashboard)/events/[eventId]/sales" tests/e2e/sales-dashboard.spec.ts
git commit -m "feat: add polling-based SSE sales dashboard"
```

---

## Session 10: Rate limiting, payout info, and PII deletion

**Session goal:** close out the spec's remaining security/PII commitments — rate-limited login and barcode lookup, sellers can actually set their (encrypted) payout details, and the owner has a working right-to-erasure path with an audit trail.

**Gap caught while planning this session:** `User.payoutMethod`/`ibanCiphertext` and the `encryptIban`/`decryptIban` helpers from Task 2.1 were defined in the schema and crypto module but never wired to any service or page in Sessions 1–9 — there was no way for a seller to actually enter their payout info. Task 10.2 below fixes that.

### Task 10.1: Rate limiting on login and barcode lookup

**Files:**
- Create: `lib/rate-limit.ts`
- Modify: `actions/auth.ts` (adds a rate-limit check to `login`)
- Modify: `lib/services/sales.ts` (adds a rate-limit check to `lookupItemByCode`)
- Modify: `tests/unit/actions/auth.test.ts` (mocks `lib/rate-limit` and adds a rejection test)
- Modify: `tests/integration/sales.test.ts` (mocks `lib/rate-limit` so DB-focused tests don't depend on live Upstash)
- Test: `tests/unit/rate-limit.test.ts`

**Interfaces:**
- Produces: `checkRateLimit(limiter, identifier): Promise<{ allowed: boolean }>`, `loginRateLimiter`, `barcodeLookupRateLimiter`.

- [ ] **Step 1: Write the failing test — `tests/unit/rate-limit.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { checkRateLimit } from '@/lib/rate-limit'

describe('checkRateLimit', () => {
  it('returns allowed: true when the underlying limiter reports success', async () => {
    const limiter = { limit: vi.fn().mockResolvedValue({ success: true }) } as any
    const result = await checkRateLimit(limiter, 'user-1')
    expect(result.allowed).toBe(true)
    expect(limiter.limit).toHaveBeenCalledWith('user-1')
  })

  it('returns allowed: false when the underlying limiter reports failure', async () => {
    const limiter = { limit: vi.fn().mockResolvedValue({ success: false }) } as any
    const result = await checkRateLimit(limiter, 'user-1')
    expect(result.allowed).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/rate-limit.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rate-limit'`

- [ ] **Step 3: Write `lib/rate-limit.ts`**

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export const loginRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'ratelimit:login',
})

export const barcodeLookupRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'ratelimit:barcode-lookup',
})

export async function checkRateLimit(limiter: Ratelimit, identifier: string): Promise<{ allowed: boolean }> {
  const { success } = await limiter.limit(identifier)
  return { allowed: success }
}
```

Note: `Redis.fromEnv()`/`new Ratelimit(...)` only read env vars and construct local objects — they make no network call until `.limit()` is actually invoked, so importing this module is safe even before real Upstash credentials are configured (`.env.example` already has placeholder `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` keys from Task 1.3).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/rate-limit.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Modify `actions/auth.ts`** — add the rate-limit check to `login`

```typescript
import { loginRateLimiter, checkRateLimit } from '@/lib/rate-limit'

export async function login(formData: FormData): Promise<Result<{ redirectTo: string }>> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  const { allowed } = await checkRateLimit(loginRateLimiter, parsed.data.email)
  if (!allowed) {
    return { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please try again in a minute.' } }
  }

  try {
    await signIn('credentials', { ...parsed.data, redirect: false })
    return { ok: true, data: { redirectTo: '/events' } }
  } catch {
    return { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } }
  }
}
```

(Add the import alongside the existing imports at the top of the file; the rest of `actions/auth.ts` from Task 2.4 is unchanged.)

- [ ] **Step 6: Modify `tests/unit/actions/auth.test.ts`** — mock the rate limiter and add a rejection test

Add this mock alongside the existing `vi.mock` calls at the top of the file:

```typescript
vi.mock('@/lib/rate-limit', () => ({
  loginRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))
```

Add this test to the `describe('login action', ...)` block:

```typescript
it('rejects login attempts once rate-limited, without calling signIn', async () => {
  const { login } = await import('@/actions/auth')
  const { checkRateLimit } = await import('@/lib/rate-limit')
  const { signIn } = await import('@/lib/auth')
  vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false })

  const formData = new FormData()
  formData.set('email', 'user@example.com')
  formData.set('password', 'correct-horse-battery-staple')

  const result = await login(formData)

  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.code).toBe('RATE_LIMITED')
  expect(signIn).not.toHaveBeenCalled()
})
```

- [ ] **Step 7: Modify `lib/services/sales.ts`** — add the rate-limit check to `lookupItemByCode`

```typescript
import { barcodeLookupRateLimiter, checkRateLimit } from '@/lib/rate-limit'

export async function lookupItemByCode(
  session: MinimalSession,
  eventId: string,
  code: string
): Promise<Result<{ itemId: string; name: string; price: string; sellerAlias: string; status: string }>> {
  const authz = await requireEventAccess(session, eventId, ['STAFF', 'ADMIN'])
  if (!authz.ok) return authz

  const { allowed } = await checkRateLimit(barcodeLookupRateLimiter, authz.userId)
  if (!allowed) {
    return { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many lookups — please slow down' } }
  }

  const item = await prisma.item.findFirst({ where: { eventId, barcodeValue: code } })
  // ...rest of the function body is unchanged from Task 8.1
```

(Add the import at the top of the file; insert the rate-limit check as shown, keeping the rest of `lookupItemByCode` and all of `recordSale` exactly as written in Task 8.1.)

- [ ] **Step 8: Modify `tests/integration/sales.test.ts`** — mock the rate limiter so these DB tests don't depend on live Upstash

Add this mock at the very top of the file, before the other imports:

```typescript
import { vi } from 'vitest'
vi.mock('@/lib/rate-limit', () => ({
  barcodeLookupRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))
```

- [ ] **Step 9: Run the full test suite to verify everything still passes**

Run: `npx vitest run tests/unit/rate-limit.test.ts tests/unit/actions/auth.test.ts tests/integration/sales.test.ts`
Expected: all tests PASS, including the new rate-limit rejection test, with no network calls made to Upstash.

- [ ] **Step 10: Commit**

```bash
git add lib/rate-limit.ts actions/auth.ts lib/services/sales.ts tests/unit/rate-limit.test.ts tests/unit/actions/auth.test.ts tests/integration/sales.test.ts
git commit -m "feat: add rate limiting to login and barcode lookup"
```

### Task 10.2: Payout info (encrypted IBAN) — the missing piece from Sessions 1-9

**Files:**
- Create: `lib/services/profile.ts`
- Create: `actions/profile.ts`
- Create: `app/(dashboard)/profile/page.tsx`
- Modify: `lib/validation/user.ts` (adds `isValidIban` and `payoutInfoSchema`)
- Test: `tests/unit/iban-validation.test.ts`
- Test: `tests/integration/profile.test.ts`

**Interfaces:**
- Consumes: `encryptIban`/`decryptIban` from `lib/crypto.ts` (Task 2.1).
- Produces: `updatePayoutInfo(session, input)`, `getOwnPayoutInfo(session)` — used by `actions/profile.ts` and the `/profile` page.

- [ ] **Step 1: Write the failing test — `tests/unit/iban-validation.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { isValidIban } from '@/lib/validation/user'

describe('isValidIban', () => {
  it('accepts a valid Finnish IBAN', () => {
    expect(isValidIban('FI2112345600000785')).toBe(true)
  })

  it('accepts a valid IBAN written with spaces', () => {
    expect(isValidIban('FI21 1234 5600 0007 85')).toBe(true)
  })

  it('rejects an IBAN with a bad checksum', () => {
    expect(isValidIban('FI2112345600000786')).toBe(false)
  })

  it('rejects a malformed string', () => {
    expect(isValidIban('not-an-iban')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/iban-validation.test.ts`
Expected: FAIL — `isValidIban` is not exported yet.

- [ ] **Step 3: Modify `lib/validation/user.ts`** — add the mod-97 IBAN checksum validator and payout schema

```typescript
export function isValidIban(iban: string): boolean {
  const normalized = iban.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(normalized)) return false

  const rearranged = normalized.slice(4) + normalized.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55))

  let remainder = 0
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97
  }
  return remainder === 1
}

export const payoutInfoSchema = z
  .object({
    payoutMethod: z.enum(['CASH', 'BANK_TRANSFER']),
    iban: z.string().optional(),
  })
  .refine((data) => data.payoutMethod !== 'BANK_TRANSFER' || (!!data.iban && isValidIban(data.iban)), {
    message: 'A valid IBAN is required for bank transfer payout',
    path: ['iban'],
  })
```

(Add these to the existing `lib/validation/user.ts` from Task 2.2, alongside `loginSchema`/`inviteUserSchema`/`acceptInviteSchema`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/iban-validation.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Write the failing test — `tests/integration/profile.test.ts`**

```typescript
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetDb } from './setup'
import { updatePayoutInfo, getOwnPayoutInfo } from '@/lib/services/profile'

function sessionFor(userId: string) {
  return { user: { id: userId } } as any
}

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
})

describe('updatePayoutInfo / getOwnPayoutInfo', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('stores the IBAN encrypted at rest and returns it decrypted to its owner', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller@example.com', passwordHash: 'x' } })

    const result = await updatePayoutInfo(sessionFor(user.id), { payoutMethod: 'BANK_TRANSFER', iban: 'FI2112345600000785' })
    expect(result.ok).toBe(true)

    const raw = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(raw.ibanCiphertext).not.toBeNull()
    expect(raw.ibanCiphertext).not.toContain('FI21')

    const own = await getOwnPayoutInfo(sessionFor(user.id))
    expect(own.ok).toBe(true)
    if (own.ok) expect(own.data.iban).toBe('FI2112345600000785')
  })

  it('rejects an invalid IBAN', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller2@example.com', passwordHash: 'x' } })
    const result = await updatePayoutInfo(sessionFor(user.id), { payoutMethod: 'BANK_TRANSFER', iban: 'not-an-iban' })
    expect(result.ok).toBe(false)
  })

  it('allows CASH payout with no IBAN', async () => {
    const user = await testPrisma.user.create({ data: { name: 'Seller', email: 'seller3@example.com', passwordHash: 'x' } })
    const result = await updatePayoutInfo(sessionFor(user.id), { payoutMethod: 'CASH' })
    expect(result.ok).toBe(true)
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/integration/profile.test.ts`
Expected: FAIL — `Cannot find module '@/lib/services/profile'`

- [ ] **Step 7: Write `lib/services/profile.ts`**

```typescript
import { prisma } from '@/lib/db'
import { encryptIban, decryptIban } from '@/lib/crypto'
import { payoutInfoSchema } from '@/lib/validation/user'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

export async function updatePayoutInfo(session: MinimalSession, input: unknown): Promise<Result<{}>> {
  const userId = session?.user?.id
  if (!userId) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }
  }

  const parsed = payoutInfoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      payoutMethod: parsed.data.payoutMethod,
      ibanCiphertext: parsed.data.iban ? encryptIban(parsed.data.iban) : null,
    },
  })

  return { ok: true, data: {} }
}

export async function getOwnPayoutInfo(
  session: MinimalSession
): Promise<Result<{ payoutMethod: string | null; iban: string | null }>> {
  const userId = session?.user?.id
  if (!userId) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  return {
    ok: true,
    data: {
      payoutMethod: user.payoutMethod,
      iban: user.ibanCiphertext ? decryptIban(user.ibanCiphertext) : null,
    },
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/integration/profile.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 9: Write `actions/profile.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { updatePayoutInfo as updatePayoutInfoService } from '@/lib/services/profile'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export async function updatePayoutInfo(formData: FormData): Promise<Result<{}>> {
  const session = await auth()
  const result = await updatePayoutInfoService(session, {
    payoutMethod: formData.get('payoutMethod'),
    iban: formData.get('iban') || undefined,
  })
  if (result.ok) revalidatePath('/profile')
  return result
}
```

- [ ] **Step 10: Write `app/(dashboard)/profile/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getOwnPayoutInfo } from '@/lib/services/profile'
import { updatePayoutInfo } from '@/actions/profile'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const info = await getOwnPayoutInfo(session)
  const current = info.ok ? info.data : { payoutMethod: null, iban: null }

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Payout information</h1>
      <form
        action={async (formData) => {
          'use server'
          await updatePayoutInfo(formData)
        }}
        className="mt-4 flex max-w-sm flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          Payout method
          <select name="payoutMethod" defaultValue={current.payoutMethod ?? 'CASH'} className="rounded border px-2 py-1">
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          IBAN (required for bank transfer)
          <input name="iban" defaultValue={current.iban ?? ''} className="rounded border px-2 py-1" />
        </label>
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          Save
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 11: Commit**

```bash
git add lib/services/profile.ts actions/profile.ts "app/(dashboard)/profile" lib/validation/user.ts tests/unit/iban-validation.test.ts tests/integration/profile.test.ts
git commit -m "feat: add seller payout info with encrypted IBAN storage"
```

### Task 10.3: Right-to-erasure (PII deletion) with audit trail

**Files:**
- Modify: `lib/services/users.ts` (adds `deleteUserPii`)
- Create: `actions/users.ts`
- Create: `app/(dashboard)/admin/page.tsx`
- Create: `app/(dashboard)/audit/page.tsx`
- Modify: `tests/integration/users.test.ts` (adds a `deleteUserPii` describe block)
- Test: `tests/e2e/pii-deletion.spec.ts`

**Interfaces:**
- Consumes: `requireOwner` (Task 3.1), `writeAuditLog` (Task 3.2).
- Produces: `deleteUserPii(session, targetUserId): Promise<Result<{}>>`.

- [ ] **Step 1: Append the failing test to `tests/integration/users.test.ts`**

```typescript
import { deleteUserPii } from '@/lib/services/users'

describe('deleteUserPii', () => {
  beforeEach(async () => { await resetDb() })
  afterAll(async () => { await testPrisma.$disconnect() })

  it('scrubs PII fields, prevents future login, and writes an audit log', async () => {
    const owner = await testPrisma.user.create({ data: { name: 'Owner', email: 'owner4@example.com', isOwner: true, passwordHash: 'x' } })
    const target = await testPrisma.user.create({
      data: { name: 'Real Name', email: 'real@example.com', phone: '+358401234567', passwordHash: 'hash', ibanCiphertext: 'ciphertext' },
    })

    const result = await deleteUserPii(sessionFor(owner.id), target.id)
    expect(result.ok).toBe(true)

    const scrubbed = await testPrisma.user.findUniqueOrThrow({ where: { id: target.id } })
    expect(scrubbed.name).toBe('Deleted user')
    expect(scrubbed.phone).toBeNull()
    expect(scrubbed.ibanCiphertext).toBeNull()
    expect(scrubbed.passwordHash).toBeNull()
    expect(scrubbed.email).not.toBe('real@example.com')

    const log = await testPrisma.auditLog.findFirst({ where: { action: 'USER_PII_DELETED' } })
    expect(log?.targetId).toBe(target.id)
  })

  it('rejects a non-owner', async () => {
    const admin = await testPrisma.user.create({ data: { name: 'Admin', email: 'admin4@example.com', passwordHash: 'x' } })
    const target = await testPrisma.user.create({ data: { name: 'Target', email: 'target2@example.com', passwordHash: 'x' } })
    const result = await deleteUserPii(sessionFor(admin.id), target.id)
    expect(result.ok).toBe(false)
  })
})
```

(`sessionFor` and `testPrisma`/`resetDb` are already imported/defined earlier in this file from Task 2.3 — reuse them, don't redeclare.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/users.test.ts`
Expected: FAIL — `deleteUserPii` is not exported yet.

- [ ] **Step 3: Append to `lib/services/users.ts`**

> **Post-hoc correction (Task 2.5 finding):** auth uses JWT sessions with a `User.tokenVersion` field for revocation (Auth.js's Credentials provider doesn't support the database session strategy — see Task 2.2/2.5's execution notes). Deleting a user's PII must also bump `tokenVersion` here, or a session already issued before deletion stays valid (Auth.js only re-checks `tokenVersion` on session read, not on every possible use) until it naturally expires, even though `passwordHash: null` already blocks any *future* login.

```typescript
import { requireOwner } from '@/lib/services/authz'
import { writeAuditLog } from '@/lib/services/audit'

export async function deleteUserPii(session: MinimalSession, targetUserId: string): Promise<Result<{}>> {
  const authz = await requireOwner(session)
  if (!authz.ok) return authz

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      name: 'Deleted user',
      email: `deleted-${targetUserId}@deleted.local`,
      phone: null,
      ibanCiphertext: null,
      payoutMethod: null,
      passwordHash: null,
      inviteToken: null,
      tokenVersion: { increment: 1 },
    },
  })

  await writeAuditLog({
    actorUserId: authz.userId,
    action: 'USER_PII_DELETED',
    targetType: 'User',
    targetId: targetUserId,
  })

  return { ok: true, data: {} }
}
```

(`MinimalSession` and `Result` types already exist at the top of `lib/services/users.ts` from Task 2.3 — reuse them.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/users.test.ts`
Expected: all tests in the file PASS, including the two new `deleteUserPii` tests.

- [ ] **Step 5: Write `actions/users.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { deleteUserPii as deleteUserPiiService } from '@/lib/services/users'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export async function deleteUserPii(targetUserId: string): Promise<Result<{}>> {
  const session = await auth()
  const result = await deleteUserPiiService(session, targetUserId)
  if (result.ok) revalidatePath('/admin')
  return result
}
```

- [ ] **Step 6: Write `app/(dashboard)/admin/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { requireOwner } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { deleteUserPii } from '@/actions/users'

export default async function AdminPage() {
  const session = await auth()
  const authz = await requireOwner(session)
  if (!authz.ok) redirect('/events')

  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } })

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Admin</h1>
      <Link href="/audit" className="underline">
        View audit log
      </Link>

      <table className="mt-4 text-sm">
        <thead>
          <tr>
            <th className="pr-4 text-left">Name</th>
            <th className="pr-4 text-left">Email</th>
            <th className="text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="pr-4">{u.name}</td>
              <td className="pr-4">{u.email}</td>
              <td>
                {!u.isOwner && (
                  <form
                    action={async () => {
                      'use server'
                      await deleteUserPii(u.id)
                    }}
                  >
                    <button type="submit" className="text-sm text-red-600 underline">
                      Delete PII
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 7: Write `app/(dashboard)/audit/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireOwner } from '@/lib/services/authz'
import { prisma } from '@/lib/db'

export default async function AuditLogPage() {
  const session = await auth()
  const authz = await requireOwner(session)
  if (!authz.ok) redirect('/events')

  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { actor: true } })

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Audit log</h1>
      <table className="mt-4 text-sm">
        <thead>
          <tr>
            <th className="pr-4 text-left">When</th>
            <th className="pr-4 text-left">Actor</th>
            <th className="pr-4 text-left">Action</th>
            <th className="text-left">Target</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="pr-4">{log.createdAt.toISOString()}</td>
              <td className="pr-4">{log.actor.name}</td>
              <td className="pr-4">{log.action}</td>
              <td>
                {log.targetType}:{log.targetId}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 8: Write the failing E2E test — `tests/e2e/pii-deletion.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { testPrisma, resetDb } from '../integration/setup'
import { hashPassword } from '../../lib/crypto'

test.beforeEach(async () => {
  await resetDb()
})
test.afterAll(async () => {
  await testPrisma.$disconnect()
})

test("owner deletes a user's PII, and that user can no longer log in", async ({ page }) => {
  await testPrisma.user.create({
    data: { name: 'Owner', email: 'owner@example.com', isOwner: true, passwordHash: await hashPassword('owner-pw-12345') },
  })
  const target = await testPrisma.user.create({
    data: { name: 'Target Seller', email: 'target@example.com', passwordHash: await hashPassword('target-pw-12345'), phone: '+358401234567' },
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('owner@example.com')
  await page.getByLabel('Password').fill('owner-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()

  await page.goto('/admin')
  await page.getByRole('row', { name: /Target Seller/ }).getByRole('button', { name: /delete pii/i }).click()
  await expect(page.getByText('Target Seller')).toHaveCount(0)

  const scrubbed = await testPrisma.user.findUniqueOrThrow({ where: { id: target.id } })
  expect(scrubbed.passwordHash).toBeNull()
  expect(scrubbed.phone).toBeNull()

  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email').fill('target@example.com')
  await page.getByLabel('Password').fill('target-pw-12345')
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).toHaveURL(/\/login/)
})
```

- [ ] **Step 9: Run the E2E test to verify it fails, then passes**

Run: `npx playwright test tests/e2e/pii-deletion.spec.ts`
Expected: FAILs before Steps 5-7 exist; PASSes once complete. Confirm it passes.

- [ ] **Step 10: Commit**

```bash
git add lib/services/users.ts actions/users.ts "app/(dashboard)/admin" "app/(dashboard)/audit" tests/integration/users.test.ts tests/e2e/pii-deletion.spec.ts
git commit -m "feat: add right-to-erasure PII deletion with audit trail"
```

---

## Session 11: CI, local dev infrastructure, and final verification

**Session goal:** the full test suite (all unit, integration, and E2E tests written across Sessions 1–10) runs correctly both locally and in CI on every push, and the MVP is verifiably complete end-to-end. This session also fixes one latent correctness bug in the test setup itself before it can cause flaky failures.

### Task 11.1: Fix a shared-test-database race condition

**Files:**
- Modify: `vitest.config.ts` (from Task 1.4)

**Interfaces:** none — this is a test-runner configuration fix.

**Why this is needed:** every integration test file written in Sessions 1–10 (`db.test.ts`, `auth-config.test.ts`, `users.test.ts`, `authz.test.ts`, `audit.test.ts`, `events.test.ts`, `items.test.ts`, `imports.test.ts`, `price-tags.test.ts`, `sales.test.ts`, `sales-dashboard.test.ts`, `profile.test.ts`) calls `resetDb()` in its `beforeEach`, which `TRUNCATE`s every table in the shared test database. Vitest's default is to run separate test *files* in parallel worker processes. If two integration test files ran concurrently against the same database, one file's `resetDb()` could wipe out rows another file's test was mid-assertion on — a source of rare, hard-to-reproduce CI failures. Since all integration tests share one database, they must run one file at a time.

- [ ] **Step 1: Modify `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Integration tests share one Postgres database and each file's beforeEach
    // truncates every table via resetDb() — running files in parallel would let
    // one file's reset wipe data another file's test is mid-assertion on.
    fileParallelism: false,
  },
})
```

- [ ] **Step 2: Run the full unit + integration suite to confirm it's still green under sequential execution**

Run: `npx vitest run`
Expected: every test file from Sessions 1-10 PASSes. This will take longer than before (files no longer overlap) — that's expected and correct.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "fix: run integration test files sequentially to prevent shared-DB races"
```

### Task 11.2: Local Postgres via Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `scripts/init-db.sql`
- Modify: `.env.example` (aligns the connection strings with the compose service's default `postgres` user)

**Interfaces:** none — local developer infrastructure only.

- [ ] **Step 1: Write `scripts/init-db.sql`**

```sql
CREATE DATABASE myyntijarjestelma;
CREATE DATABASE myyntijarjestelma_test;
```

- [ ] **Step 2: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: password
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql

volumes:
  postgres_data:
```

- [ ] **Step 3: Modify `.env.example`** to match the compose service's default `postgres` user

```
DATABASE_URL="postgresql://postgres:password@localhost:5432/myyntijarjestelma?schema=public"
DATABASE_URL_TEST="postgresql://postgres:password@localhost:5432/myyntijarjestelma_test?schema=public"
AUTH_SECRET="generate-with-npx-auth-secret"
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
PII_ENCRYPTION_KEY="32-byte-base64-key-for-iban-encryption"
```

- [ ] **Step 4: Start the database and verify both schemas migrate cleanly**

```bash
docker compose up -d
cp .env.example .env
# edit .env with a real AUTH_SECRET (npx auth secret) and PII_ENCRYPTION_KEY (openssl rand -base64 32)
npx prisma migrate deploy
DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy
```
Expected: both commands report the migration already applied / applied successfully, with no connection errors.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml scripts/init-db.sql .env.example
git commit -m "chore: add docker-compose Postgres setup for local development"
```

### Task 11.3: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:** none.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: password
          POSTGRES_DB: myyntijarjestelma_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Generate ephemeral CI secrets
        run: |
          echo "AUTH_SECRET=$(openssl rand -base64 32)" >> "$GITHUB_ENV"
          echo "PII_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> "$GITHUB_ENV"
          echo "DATABASE_URL=postgresql://postgres:password@localhost:5432/myyntijarjestelma_test?schema=public" >> "$GITHUB_ENV"
          echo "DATABASE_URL_TEST=postgresql://postgres:password@localhost:5432/myyntijarjestelma_test?schema=public" >> "$GITHUB_ENV"
          echo "UPSTASH_REDIS_REST_URL=https://ci-unused.upstash.io" >> "$GITHUB_ENV"
          echo "UPSTASH_REDIS_REST_TOKEN=ci-unused-token" >> "$GITHUB_ENV"

      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run lint
      - run: npm run test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

Note: `UPSTASH_REDIS_REST_URL`/`TOKEN` point at a placeholder host — this is safe because every test file that exercises rate-limited code paths (`tests/unit/actions/auth.test.ts`, `tests/integration/sales.test.ts`) mocks `@/lib/rate-limit` per Task 10.1, so no test ever makes a real network call to Upstash. CI would only fail here if a *new* test exercised rate-limited code without that mock — a reasonable trip-wire, not a gap.

- [ ] **Step 2: Push a commit and verify the workflow runs green in the GitHub Actions tab**

This step can only be verified after pushing to a GitHub remote — confirm the workflow file is syntactically valid locally first with `npx yaml-lint .github/workflows/ci.yml` if available, otherwise defer the live check to the first push.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run lint, unit/integration tests, and E2E tests on every push"
```

### Task 11.4: Full-suite verification

**Files:** none — verification only.

- [ ] **Step 1: Run the complete unit and integration suite**

Run: `npx vitest run`
Expected: every test file across all 11 sessions PASSes, with zero failures.

- [ ] **Step 2: Run the complete E2E suite**

Run: `npx playwright test`
Expected: all E2E specs PASS — `auth.spec.ts`, `security-headers.spec.ts`, `events.spec.ts`, `items.spec.ts`, `import.spec.ts`, `price-tags.spec.ts`, `checkout.spec.ts`, `sales-dashboard.spec.ts`, `pii-deletion.spec.ts`.

- [ ] **Step 3: Run the production build to catch any type errors or build-time issues the dev server wouldn't surface**

Run: `npm run build`
Expected: build completes successfully with no TypeScript or lint errors.

- [ ] **Step 4: Manually walk the golden path once in the running app**

Run: `npm run dev`, then in a browser: log in as the seeded owner, create an event, invite a seller, accept the invite as that seller, add an item, import a few more via CSV, generate a price tag PDF, log in as staff, scan the barcode from the PDF (or type its fallback code) at checkout, confirm the sale, and verify it appears on the seller's sales dashboard. This confirms the pieces built independently across 11 sessions actually compose into the working MVP the spec describes.

- [ ] **Step 5: Commit** (only if Step 4 surfaced a fix — otherwise this session's work is already committed per-task)

```bash
git status
# if there are uncommitted fixes from the manual walkthrough:
git add -A
git commit -m "fix: address issues found during MVP golden-path walkthrough"
```

---
