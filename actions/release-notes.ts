'use server'

import { auth } from '@/lib/auth'
import { markReleaseNoteSeen } from '@/lib/services/release-notes'

export async function dismissReleaseNote(date: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return
  await markReleaseNoteSeen(session.user.id, date)
}
