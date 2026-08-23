'use client'

import { useActionState, useEffect, useRef } from 'react'
import { handleImportForm, type ImportFormState } from '@/actions/imports'

const initialState: ImportFormState = { status: 'idle' }

export function ImportForm({ eventId }: { eventId: string }) {
  const [state, formAction, isPending] = useActionState(handleImportForm.bind(null, eventId), initialState)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedFileRef = useRef<File | null>(null)

  // React resets uncontrolled form fields (including file inputs) after a
  // form action completes successfully. Since preview and commit are two
  // submits of the same <form>, that reset would wipe the file before the
  // second click. Restore the file the user actually picked so both submits
  // read the same uploaded bytes, matching the same-file design intent.
  useEffect(() => {
    const input = fileInputRef.current
    const file = selectedFileRef.current
    if (input && file && input.files?.length === 0) {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      input.files = dataTransfer.files
    }
  }, [state])

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <input
        ref={fileInputRef}
        name="file"
        type="file"
        accept=".csv,.xlsx"
        required
        className="rounded border px-2 py-1"
        onChange={(e) => {
          selectedFileRef.current = e.target.files?.[0] ?? null
        }}
      />
      <div className="flex gap-2">
        <button type="submit" name="intent" value="preview" disabled={isPending} className="rounded border px-4 py-2">
          Preview
        </button>
        <button type="submit" name="intent" value="commit" disabled={isPending} className="rounded bg-black px-4 py-2 text-white">
          Confirm import
        </button>
      </div>

      {state.status === 'error' && <p className="text-red-600">{state.message}</p>}

      {state.status === 'preview' && (
        <div>
          <p>{state.validCount} valid row(s) ready to import.</p>
          {state.rowErrors.length > 0 && (
            <table className="mt-2 text-sm">
              <thead>
                <tr>
                  <th className="pr-4 text-left">Row</th>
                  <th className="pr-4 text-left">Field</th>
                  <th className="text-left">Problem</th>
                </tr>
              </thead>
              <tbody>
                {state.rowErrors.map((e, i) => (
                  <tr key={i}>
                    <td className="pr-4">{e.row}</td>
                    <td className="pr-4">{e.field}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {state.status === 'committed' && <p className="text-green-700">Imported {state.createdCount} item(s).</p>}
    </form>
  )
}
