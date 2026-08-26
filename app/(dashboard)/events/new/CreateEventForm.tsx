'use client'

import { useState } from 'react'
import { createEvent } from '@/actions/events'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function CreateEventForm() {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await createEvent(formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    window.location.href = `/events/${result.data.eventId}`
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <Input name="name" placeholder="Event name" required />
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="eventDate">Event date</Label>
        <Input id="eventDate" name="eventDate" type="date" required />
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="registrationDeadline">Registration deadline</Label>
        <Input id="registrationDeadline" name="registrationDeadline" type="date" required />
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="itemEditCutoffDate">Item edit cutoff</Label>
        <Input id="itemEditCutoffDate" name="itemEditCutoffDate" type="date" required />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit">Create event</Button>
    </form>
  )
}
