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
