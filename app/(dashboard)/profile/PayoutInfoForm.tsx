'use client'

import { useState } from 'react'
import { updatePayoutInfo } from '@/actions/profile'

export function PayoutInfoForm({
  currentPayoutMethod,
  currentIban,
}: {
  currentPayoutMethod: string | null
  currentIban: string | null
}) {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await updatePayoutInfo(formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
  }

  return (
    <form action={handleSubmit} className="mt-4 flex max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Payout method
        <select
          name="payoutMethod"
          defaultValue={currentPayoutMethod ?? 'CASH'}
          className="rounded border px-2 py-1"
        >
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        IBAN (required for bank transfer)
        <input name="iban" defaultValue={currentIban ?? ''} className="rounded border px-2 py-1" />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <button type="submit" className="rounded bg-black px-4 py-2 text-white">
        Save
      </button>
    </form>
  )
}
