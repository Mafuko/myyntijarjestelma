'use server'

import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { updateUserLocale } from '@/lib/services/users'

export async function setLocale(locale: string): Promise<void> {
  if (locale !== 'en' && locale !== 'fi') return

  const cookieStore = await cookies()
  cookieStore.set('NEXT_LOCALE', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 })

  const session = await auth()
  if (session?.user?.id) {
    await updateUserLocale(session.user.id, locale)
  }
}
