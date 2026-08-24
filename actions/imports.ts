'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { parseImportFile, validateImportRows, commitImport, type RowError } from '@/lib/services/imports'

export type ImportFormState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'preview'; validCount: number; rowErrors: RowError[] }
  | { status: 'committed'; createdCount: number }

export async function handleImportForm(
  eventId: string,
  _prevState: ImportFormState,
  formData: FormData
): Promise<ImportFormState> {
  const session = await auth()
  const file = formData.get('file')
  const intent = formData.get('intent')

  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Please choose a file to import' }
  }

  if (intent !== 'preview' && intent !== 'commit') {
    return { status: 'error', message: 'Invalid import action' }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const parsed = await parseImportFile(file.name, buffer)
  if (!parsed.ok) {
    return { status: 'error', message: parsed.error.message }
  }

  const validated = await validateImportRows(session, eventId, parsed.data.rows)
  if (!validated.ok) {
    return { status: 'error', message: validated.error.message }
  }
  const { validRows, rowErrors } = validated.data

  if (intent === 'preview') {
    return { status: 'preview', validCount: validRows.length, rowErrors }
  }

  const result = await commitImport(session, eventId, validRows)
  if (!result.ok) {
    return { status: 'error', message: result.error.message }
  }

  revalidatePath(`/events/${eventId}/items`)
  return { status: 'committed', createdCount: result.data.createdCount }
}
