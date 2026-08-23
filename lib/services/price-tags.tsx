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
