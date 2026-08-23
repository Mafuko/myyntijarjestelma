import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST })
export const testPrisma = new PrismaClient({ adapter })

export async function resetDb() {
  await testPrisma.$executeRawUnsafe(`
    TRUNCATE TABLE "AuditLog", "Sale", "Item", "Category", "EventMembership", "Event", "User"
    RESTART IDENTITY CASCADE
  `)
}
