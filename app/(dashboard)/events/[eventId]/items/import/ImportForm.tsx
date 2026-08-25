'use client'

import { useActionState, useEffect, useRef } from 'react'
import { handleImportForm, type ImportFormState } from '@/actions/imports'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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
      <Input
        ref={fileInputRef}
        name="file"
        type="file"
        accept=".csv,.xlsx"
        required
        onChange={(e) => {
          selectedFileRef.current = e.target.files?.[0] ?? null
        }}
      />
      <div className="flex gap-2">
        <Button type="submit" name="intent" value="preview" disabled={isPending} variant="outline">
          Preview
        </Button>
        <Button type="submit" name="intent" value="commit" disabled={isPending}>
          Confirm import
        </Button>
      </div>

      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {state.status === 'preview' && (
        <div>
          <p className="text-sm text-foreground">{state.validCount} valid row(s) ready to import.</p>
          {state.rowErrors.length > 0 && (
            <Table className="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.rowErrors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.row}</TableCell>
                    <TableCell>{e.field}</TableCell>
                    <TableCell>{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {state.status === 'committed' && <p className="text-sm text-success">Imported {state.createdCount} item(s).</p>}
    </form>
  )
}
