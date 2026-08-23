'use server'

import { signIn, signOut } from '@/lib/auth'
import { activateInvite } from '@/lib/services/users'
import { loginSchema } from '@/lib/validation/user'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export async function login(formData: FormData): Promise<Result<{ redirectTo: string }>> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  try {
    await signIn('credentials', { ...parsed.data, redirect: false })
    return { ok: true, data: { redirectTo: '/events' } }
  } catch {
    return { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } }
  }
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}

export async function acceptInvite(formData: FormData): Promise<Result<{ redirectTo: string }>> {
  const result = await activateInvite({
    token: formData.get('token'),
    password: formData.get('password'),
  })
  if (!result.ok) return result
  return { ok: true, data: { redirectTo: '/login' } }
}
