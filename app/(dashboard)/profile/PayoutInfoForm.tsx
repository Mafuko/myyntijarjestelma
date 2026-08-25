'use client'

import { useState } from 'react'
import { updatePayoutInfo } from '@/actions/profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

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
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="payoutMethod">Payout method</Label>
        <select
          id="payoutMethod"
          name="payoutMethod"
          defaultValue={currentPayoutMethod ?? 'CASH'}
          className={cn(
            'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="iban">IBAN (required for bank transfer)</Label>
        <Input id="iban" name="iban" defaultValue={currentIban ?? ''} />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit">Save</Button>
    </form>
  )
}
