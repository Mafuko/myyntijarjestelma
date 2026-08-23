import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { testPrisma, resetDb } from './setup'

// Exercises @auth/prisma-adapter's PrismaAdapter directly against the real
// test database (not just against the compiler). This is the check that
// would have caught the missing Session/Account/VerificationToken models:
// PrismaAdapter's type signature only requires a plain PrismaClient and
// compiles fine regardless of the schema, but createSession/getSessionAndUser/
// deleteSession call prisma.session.* internally, which only exist on the
// generated client when the Session model is present in schema.prisma. Every
// real credentials sign-in (session: { strategy: 'database' }) hits this
// path, so it must work against a live database, not merely typecheck.
describe('PrismaAdapter session lifecycle (real DB)', () => {
  const adapter = PrismaAdapter(testPrisma)

  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await testPrisma.$disconnect()
  })

  it('creates, reads, and deletes a database session for a real user', async () => {
    const user = await testPrisma.user.create({
      data: { name: 'Adapter Test User', email: 'adapter-test@example.com' },
    })

    const sessionToken = 'test-session-token-1'
    const expires = new Date(Date.now() + 1000 * 60 * 60)

    // createSession -> INSERT into "Session" (fails at runtime pre-fix: no
    // such table/model on the generated Prisma Client).
    const created = await adapter.createSession!({ sessionToken, userId: user.id, expires })
    expect(created.sessionToken).toBe(sessionToken)
    expect(created.userId).toBe(user.id)

    // getSessionAndUser -> joins "Session" and "User".
    const found = await adapter.getSessionAndUser!(sessionToken)
    expect(found?.session.sessionToken).toBe(sessionToken)
    expect(found?.user.email).toBe('adapter-test@example.com')

    // Confirm the row genuinely exists via a direct query too, not just
    // through the adapter's own abstraction.
    const rawSession = await testPrisma.session.findUnique({ where: { sessionToken } })
    expect(rawSession?.userId).toBe(user.id)

    // deleteSession -> DELETE from "Session".
    await adapter.deleteSession!(sessionToken)
    const afterDelete = await testPrisma.session.findUnique({ where: { sessionToken } })
    expect(afterDelete).toBeNull()
  })
})
