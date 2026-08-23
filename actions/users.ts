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
