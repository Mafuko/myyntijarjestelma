'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  createEvent as createEventService,
  updateEvent as updateEventService,
  inviteMemberToEvent,
} from '@/lib/services/events'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export async function createEvent(formData: FormData): Promise<Result<{ eventId: string }>> {
  const session = await auth()
  const result = await createEventService(session, {
    name: formData.get('name'),
    eventDate: formData.get('eventDate'),
    registrationDeadline: formData.get('registrationDeadline'),
    itemEditCutoffDate: formData.get('itemEditCutoffDate'),
    commissionRate: formData.get('commissionRate') || undefined,
  })
  if (result.ok) revalidatePath('/events')
  return result
}

export async function updateEvent(eventId: string, formData: FormData): Promise<Result<{ eventId: string }>> {
  const session = await auth()
  const result = await updateEventService(session, eventId, {
    commissionRate: formData.get('commissionRate') || undefined,
  })
  if (result.ok) revalidatePath(`/events/${eventId}`)
  return result
}

export async function inviteMember(
  eventId: string,
  formData: FormData
): Promise<Result<{ inviteUrl: string | null }>> {
  const session = await auth()
  const result = await inviteMemberToEvent(session, {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    role: formData.get('role') as 'SELLER' | 'STAFF' | 'ADMIN',
    eventId,
    sellerAlias: formData.get('sellerAlias') ? String(formData.get('sellerAlias')) : undefined,
  })
  if (result.ok) revalidatePath(`/events/${eventId}/members`)
  return result
}
