import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/services/sales-dashboard', () => ({ getSalesSnapshot: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), flush: vi.fn().mockResolvedValue(true) }))

const okSnapshot = { ok: true, data: { items: [], totalRevenue: '0', commissionOwed: '0' } } as const

describe('GET /api/sse/[eventId]', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('captures the exception and closes the stream when a poll tick throws', async () => {
    const { GET } = await import('@/app/api/sse/[eventId]/route')
    const { auth } = await import('@/lib/auth')
    const { getSalesSnapshot } = await import('@/lib/services/sales-dashboard')
    const Sentry = await import('@sentry/nextjs')

    vi.mocked(auth).mockResolvedValue({ user: { id: 'staff-1' } } as any)
    vi.mocked(getSalesSnapshot)
      .mockResolvedValueOnce(okSnapshot as any)
      .mockRejectedValueOnce(new Error('db down'))

    const request = new NextRequest('http://localhost/api/sse/evt-1')
    const response = await GET(request, { params: Promise.resolve({ eventId: 'evt-1' }) })
    const reader = response.body!.getReader()

    await reader.read() // consume the initial snapshot chunk sent before the interval starts

    await vi.advanceTimersByTimeAsync(2000)

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error))

    const { done } = await reader.read()
    expect(done).toBe(true)
  })

  it('does not double-report or throw when the request aborts after the poll already stopped it', async () => {
    const { GET } = await import('@/app/api/sse/[eventId]/route')
    const { auth } = await import('@/lib/auth')
    const { getSalesSnapshot } = await import('@/lib/services/sales-dashboard')
    const Sentry = await import('@sentry/nextjs')

    vi.mocked(auth).mockResolvedValue({ user: { id: 'staff-1' } } as any)
    vi.mocked(getSalesSnapshot)
      .mockResolvedValueOnce(okSnapshot as any)
      .mockRejectedValueOnce(new Error('db down'))

    const controller = new AbortController()
    const request = new NextRequest('http://localhost/api/sse/evt-1', { signal: controller.signal })
    const response = await GET(request, { params: Promise.resolve({ eventId: 'evt-1' }) })
    const reader = response.body!.getReader()
    await reader.read()

    await vi.advanceTimersByTimeAsync(2000) // poll tick throws, stop() runs once

    controller.abort() // late abort after the stream is already closed; must be a no-op

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    const { done } = await reader.read()
    expect(done).toBe(true)
  })
})
