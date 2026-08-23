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

  try {
    const result = await recordSaleService(session, itemId, method)
    if (result.ok) revalidatePath(`/events/${eventId}/sales`)
    return result
  } catch {
    // Rare path: recordSale's internal transaction can throw (e.g. a losing
    // concurrent call exceeding Prisma's default transaction timeout while
    // waiting on the winner's row lock) rather than resolving to a Result.
    // The database stays correct either way -- this only guards the Server
    // Action's contract of never throwing across the server/client boundary.
    return {
      ok: false,
      error: { code: 'UNEXPECTED_ERROR', message: 'Something went wrong recording the sale. Please try again.' },
    }
  }
}
