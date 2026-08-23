import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }) }))
vi.mock('@/lib/services/events', () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  inviteMemberToEvent: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('createEvent action', () => {
  it('parses form fields and forwards them to the service with the current session', async () => {
    const { createEvent: createEventAction } = await import('@/actions/events')
    const { createEvent: createEventService } = await import('@/lib/services/events')
    vi.mocked(createEventService).mockResolvedValueOnce({ ok: true, data: { eventId: 'evt-1' } })

    const formData = new FormData()
    formData.set('name', 'Kesäkirppis')
    formData.set('eventDate', '2026-09-01')
    formData.set('registrationDeadline', '2026-08-25')
    formData.set('itemEditCutoffDate', '2026-08-30')

    const result = await createEventAction(formData)

    expect(result.ok).toBe(true)
    expect(createEventService).toHaveBeenCalledWith(
      { user: { id: 'user-1' } },
      expect.objectContaining({ name: 'Kesäkirppis' })
    )
  })
})

describe('inviteMember action', () => {
  it('includes the eventId from the route parameter in the service call', async () => {
    const { inviteMember } = await import('@/actions/events')
    const { inviteMemberToEvent } = await import('@/lib/services/events')
    vi.mocked(inviteMemberToEvent).mockResolvedValueOnce({ ok: true, data: { inviteUrl: null } })

    const formData = new FormData()
    formData.set('name', 'New Staff')
    formData.set('email', 'staff@example.com')
    formData.set('role', 'STAFF')

    await inviteMember('evt-1', formData)

    expect(inviteMemberToEvent).toHaveBeenCalledWith(
      { user: { id: 'user-1' } },
      expect.objectContaining({ eventId: 'evt-1', email: 'staff@example.com', role: 'STAFF' })
    )
  })
})
