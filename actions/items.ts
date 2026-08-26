'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  createItem as createItemService,
  updateItem as updateItemService,
  deleteItem as deleteItemService,
  createItemBatch as createItemBatchService,
} from '@/lib/services/items'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

function itemInputFromFormData(formData: FormData) {
  return {
    name: formData.get('name'),
    price: formData.get('price'),
    categoryId: formData.get('categoryId'),
    isAgeRestricted: formData.get('isAgeRestricted') === 'on',
  }
}

export async function createItem(eventId: string, formData: FormData): Promise<Result<{ itemId: string }>> {
  const session = await auth()
  const result = await createItemService(session, eventId, itemInputFromFormData(formData))
  if (result.ok) revalidatePath(`/events/${eventId}/items`)
  return result
}

export async function updateItem(itemId: string, eventId: string, formData: FormData): Promise<Result<{ itemId: string }>> {
  const session = await auth()
  const result = await updateItemService(session, itemId, itemInputFromFormData(formData))
  if (result.ok) revalidatePath(`/events/${eventId}/items`)
  return result
}

export async function deleteItem(itemId: string, eventId: string): Promise<Result<{ itemId: string }>> {
  const session = await auth()
  const result = await deleteItemService(session, itemId)
  if (result.ok) revalidatePath(`/events/${eventId}/items`)
  return result
}

export async function createItemBatch(eventId: string, formData: FormData): Promise<Result<{ itemIds: string[] }>> {
  const session = await auth()
  const result = await createItemBatchService(session, eventId, {
    baseName: formData.get('baseName'),
    startVolume: formData.get('startVolume'),
    endVolume: formData.get('endVolume'),
    price: formData.get('price'),
    categoryId: formData.get('categoryId'),
    isAgeRestricted: formData.get('isAgeRestricted') === 'on',
    mode: formData.get('mode'),
  })
  if (result.ok) revalidatePath(`/events/${eventId}/items`)
  return result
}
