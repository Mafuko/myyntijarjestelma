'use client'

import { useState } from 'react'
import { updateEvent } from '@/actions/events'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function UpdateCommissionForm({ eventId, commissionRate }: { eventId: string; commissionRate: string }) {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await updateEvent(eventId, formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
  }

  return (
    <form action={handleSubmit} className="flex max-w-xs flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="commissionRate">Commission rate (0–1)</Label>
          <Input id="commissionRate" name="commissionRate" type="number" step="0.01" min="0" max="1" defaultValue={commissionRate} />
        </div>
        <Button type="submit" size="sm">
          Update
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
