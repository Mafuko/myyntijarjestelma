import { prisma } from '@/lib/db'
import { barcodeLookupRateLimiter, checkRateLimit } from '@/lib/rate-limit'
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

  const { allowed } = await checkRateLimit(barcodeLookupRateLimiter, authz.userId)
  if (!allowed) {
    return { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many lookups — please slow down' } }
  }

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
