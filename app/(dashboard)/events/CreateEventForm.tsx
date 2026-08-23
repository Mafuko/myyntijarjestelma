'use client'

import { useState } from 'react'
import { createEvent } from '@/actions/events'

export function CreateEventForm() {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await createEvent(formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
  }

  return (
    <form action={handleSubmit} className="mt-8 flex max-w-sm flex-col gap-3">
      <h2 className="font-medium">Create event</h2>
      <input name="name" placeholder="Event name" required className="rounded border px-2 py-1" />
      <label className="flex flex-col gap-1 text-sm">
        Event date
        <input name="eventDate" type="date" required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Registration deadline
        <input name="registrationDeadline" type="date" required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Item edit cutoff
        <input name="itemEditCutoffDate" type="date" required className="rounded border px-2 py-1" />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <button type="submit" className="rounded bg-black px-4 py-2 text-white">
        Create event
      </button>
    </form>
  )
}
