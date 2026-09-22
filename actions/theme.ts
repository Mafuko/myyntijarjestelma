'use server'

import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { updateUserTheme } from '@/lib/services/users'

export async function setTheme(theme: string): Promise<void> {
  if (theme !== 'dark' && theme !== 'light') return

  const cookieStore = await cookies()
  cookieStore.set('THEME', theme, { path: '/', maxAge: 60 * 60 * 24 * 365 })

  const session = await auth()
  if (session?.user?.id) {
    await updateUserTheme(session.user.id, theme)
  }
}
