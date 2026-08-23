'use client'

import { useState } from 'react'
import { inviteMember } from '@/actions/events'

export function InviteMemberForm({ eventId }: { eventId: string }) {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await inviteMember(eventId, formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
  }

  return (
    <form action={handleSubmit} className="mt-8 flex max-w-sm flex-col gap-3">
      <h2 className="font-medium">Invite a member</h2>
      <input name="name" placeholder="Name" required className="rounded border px-2 py-1" />
      <input name="email" type="email" placeholder="Email" required className="rounded border px-2 py-1" />
      <select name="role" required className="rounded border px-2 py-1">
        <option value="SELLER">Myyjä</option>
        <option value="STAFF">Työvoima</option>
        <option value="ADMIN">Ylläpitäjä</option>
      </select>
      <input name="sellerAlias" placeholder="Seller alias (required for Myyjä)" className="rounded border px-2 py-1" />
      {error && <p className="text-red-600">{error}</p>}
      <button type="submit" className="rounded bg-black px-4 py-2 text-white">
        Invite
      </button>
    </form>
  )
}
