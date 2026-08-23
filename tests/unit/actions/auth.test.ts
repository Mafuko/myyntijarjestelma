import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/lib/services/users', () => ({
  activateInvite: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({
  loginRateLimiter: {},
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
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
