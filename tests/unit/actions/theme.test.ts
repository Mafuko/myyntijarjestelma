import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/services/users', () => ({ updateUserTheme: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn() }),
}))

describe('setTheme action', () => {
  it('sets the THEME cookie regardless of session state', async () => {
    const { setTheme } = await import('@/actions/theme')
    const { auth } = await import('@/lib/auth')
    const { cookies } = await import('next/headers')
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    const setCookie = vi.fn()
    vi.mocked(cookies).mockResolvedValueOnce({ set: setCookie, get: vi.fn() } as any)

    await setTheme('light')

    expect(setCookie).toHaveBeenCalledWith('THEME', 'light', expect.objectContaining({ path: '/' }))
  })

  it('also persists the theme to the signed-in user', async () => {
    const { setTheme } = await import('@/actions/theme')
    const { auth } = await import('@/lib/auth')
    const { updateUserTheme } = await import('@/lib/services/users')
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1' } } as any)

    await setTheme('light')

    expect(updateUserTheme).toHaveBeenCalledWith('user-1', 'light')
  })

  it('does not attempt to persist anything when signed out', async () => {
    const { setTheme } = await import('@/actions/theme')
    const { auth } = await import('@/lib/auth')
    const { updateUserTheme } = await import('@/lib/services/users')
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    vi.mocked(updateUserTheme).mockClear()

    await setTheme('dark')

    expect(updateUserTheme).not.toHaveBeenCalled()
  })

  it('rejects a theme value that is not dark or light, without touching the cookie or the database', async () => {
    const { setTheme } = await import('@/actions/theme')
    const { auth } = await import('@/lib/auth')
    const { updateUserTheme } = await import('@/lib/services/users')
    const { cookies } = await import('next/headers')
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1' } } as any)
    vi.mocked(updateUserTheme).mockClear()
    const setCookie = vi.fn()
    vi.mocked(cookies).mockResolvedValueOnce({ set: setCookie, get: vi.fn() } as any)

    await setTheme('blue')

    expect(setCookie).not.toHaveBeenCalled()
    expect(updateUserTheme).not.toHaveBeenCalled()
  })
})
