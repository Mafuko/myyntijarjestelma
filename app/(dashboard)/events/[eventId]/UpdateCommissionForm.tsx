'use client'

import { useState } from 'react'
import { updateEvent } from '@/actions/events'

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
    <form action={handleSubmit} className="mt-6 flex max-w-xs flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Commission rate (0–1)
          <input
            name="commissionRate"
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={commissionRate}
            className="rounded border px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded bg-black px-3 py-1.5 text-white">
          Update
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </form>
  )
}
