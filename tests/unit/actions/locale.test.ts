import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ updateUserLocale: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn() }),
}))

describe('setLocale action', () => {
  it('sets the NEXT_LOCALE cookie regardless of session state', async () => {
    const { setLocale } = await import('@/actions/locale')
    const { auth } = await import('@/lib/auth')
    const { cookies } = await import('next/headers')
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    const setCookie = vi.fn()
    vi.mocked(cookies).mockResolvedValueOnce({ set: setCookie, get: vi.fn() } as any)

    await setLocale('fi')

    expect(setCookie).toHaveBeenCalledWith('NEXT_LOCALE', 'fi', expect.objectContaining({ path: '/' }))
  })

  it('also persists the locale to the signed-in user', async () => {
    const { setLocale } = await import('@/actions/locale')
    const { auth } = await import('@/lib/auth')
    const { updateUserLocale } = await import('@/lib/services/users')
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1' } } as any)

    await setLocale('fi')

    expect(updateUserLocale).toHaveBeenCalledWith('user-1', 'fi')
  })

  it('does not attempt to persist anything when signed out', async () => {
    const { setLocale } = await import('@/actions/locale')
    const { auth } = await import('@/lib/auth')
    const { updateUserLocale } = await import('@/lib/services/users')
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    vi.mocked(updateUserLocale).mockClear()

    await setLocale('en')

    expect(updateUserLocale).not.toHaveBeenCalled()
  })

  it('rejects a locale value that is not en or fi, without touching the cookie or the database', async () => {
    const { setLocale } = await import('@/actions/locale')
    const { auth } = await import('@/lib/auth')
    const { updateUserLocale } = await import('@/lib/services/users')
    const { cookies } = await import('next/headers')
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1' } } as any)
    vi.mocked(updateUserLocale).mockClear()
    const setCookie = vi.fn()
    vi.mocked(cookies).mockResolvedValueOnce({ set: setCookie, get: vi.fn() } as any)

    await setLocale('de')

    expect(setCookie).not.toHaveBeenCalled()
    expect(updateUserLocale).not.toHaveBeenCalled()
  })
})
