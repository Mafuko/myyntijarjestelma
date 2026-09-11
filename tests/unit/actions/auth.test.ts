import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/lib/services/users', () => ({
  activateInvite: vi.fn(),
  bootstrapOwner: vi.fn(),
  getUserLocale: vi.fn().mockResolvedValue('en'),
}))
vi.mock('@/lib/rate-limit', () => ({
  loginRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn() }),
}))

describe('login action', () => {
  it('rejects an invalid email without calling signIn', async () => {
    const { login } = await import('@/actions/auth')
    const { signIn } = await import('@/lib/auth')

    const formData = new FormData()
    formData.set('email', 'not-an-email')
    formData.set('password', 'whatever')

    const result = await login(formData)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('returns INVALID_CREDENTIALS when signIn throws', async () => {
    const { login } = await import('@/actions/auth')
    const { signIn } = await import('@/lib/auth')
    vi.mocked(signIn).mockRejectedValueOnce(new Error('CredentialsSignin'))

    const formData = new FormData()
    formData.set('email', 'user@example.com')
    formData.set('password', 'correct-horse-battery-staple')

    const result = await login(formData)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns a redirectTo on success', async () => {
    const { login } = await import('@/actions/auth')
    const { signIn } = await import('@/lib/auth')
    vi.mocked(signIn).mockResolvedValueOnce(undefined as never)

    const formData = new FormData()
    formData.set('email', 'user@example.com')
    formData.set('password', 'correct-horse-battery-staple')

    const result = await login(formData)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.redirectTo).toBe('/events')
  })

  it('hydrates the NEXT_LOCALE cookie from the signed-in user\'s stored locale', async () => {
    const { login } = await import('@/actions/auth')
    const { signIn } = await import('@/lib/auth')
    const { getUserLocale } = await import('@/lib/services/users')
    const { cookies } = await import('next/headers')
    vi.mocked(signIn).mockResolvedValueOnce(undefined as never)
    vi.mocked(getUserLocale).mockResolvedValueOnce('fi')
    const setCookie = vi.fn()
    vi.mocked(cookies).mockResolvedValueOnce({ set: setCookie, get: vi.fn() } as any)

    const formData = new FormData()
    formData.set('email', 'fi-user@example.com')
    formData.set('password', 'correct-horse-battery-staple')

    const result = await login(formData)

    expect(result.ok).toBe(true)
    expect(getUserLocale).toHaveBeenCalledWith('fi-user@example.com')
    expect(setCookie).toHaveBeenCalledWith('NEXT_LOCALE', 'fi', expect.objectContaining({ path: '/' }))
  })

  it('rejects login attempts once rate-limited, without calling signIn', async () => {
    const { login } = await import('@/actions/auth')
    const { checkRateLimit } = await import('@/lib/rate-limit')
    const { signIn } = await import('@/lib/auth')
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false })
    vi.mocked(signIn).mockClear()

    const formData = new FormData()
    formData.set('email', 'user@example.com')
    formData.set('password', 'correct-horse-battery-staple')

    const result = await login(formData)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('RATE_LIMITED')
    expect(signIn).not.toHaveBeenCalled()
  })
})

describe('acceptInvite action', () => {
  it('propagates a service error unchanged', async () => {
    const { acceptInvite } = await import('@/actions/auth')
    const { activateInvite } = await import('@/lib/services/users')
    vi.mocked(activateInvite).mockResolvedValueOnce({
      ok: false,
      error: { code: 'INVALID_TOKEN', message: 'Invite link is invalid or already used' },
    })

    const formData = new FormData()
    formData.set('token', 'bad-token')
    formData.set('password', 'a-secure-password-1')

    const result = await acceptInvite(formData)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_TOKEN')
  })
})

describe('signupOwner action', () => {
  it('propagates a service error unchanged, without calling signIn', async () => {
    const { signupOwner } = await import('@/actions/auth')
    const { bootstrapOwner } = await import('@/lib/services/users')
    const { signIn } = await import('@/lib/auth')
    vi.mocked(bootstrapOwner).mockResolvedValueOnce({
      ok: false,
      error: { code: 'ALREADY_INITIALIZED', message: 'Setup has already been completed' },
    })
    vi.mocked(signIn).mockClear()

    const formData = new FormData()
    formData.set('name', 'First Owner')
    formData.set('email', 'owner@example.com')
    formData.set('password', 'a-secure-password-1')

    const result = await signupOwner(formData)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ALREADY_INITIALIZED')
    expect(signIn).not.toHaveBeenCalled()
  })

  it('signs in and returns a redirectTo of /events on success', async () => {
    const { signupOwner } = await import('@/actions/auth')
    const { bootstrapOwner } = await import('@/lib/services/users')
    const { signIn } = await import('@/lib/auth')
    vi.mocked(bootstrapOwner).mockResolvedValueOnce({ ok: true, data: { userId: 'user-1' } })
    vi.mocked(signIn).mockResolvedValueOnce(undefined as never)

    const formData = new FormData()
    formData.set('name', 'First Owner')
    formData.set('email', 'owner@example.com')
    formData.set('password', 'a-secure-password-1')

    const result = await signupOwner(formData)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.redirectTo).toBe('/events')
    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'owner@example.com',
      password: 'a-secure-password-1',
      redirect: false,
    })
  })
})
