'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('PayoutInfoForm')
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
        <Label htmlFor="payoutMethod">{t('payoutMethodLabel')}</Label>
        <select
          id="payoutMethod"
          name="payoutMethod"
          defaultValue={currentPayoutMethod ?? 'CASH'}
          className={cn(
            'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <option value="CASH">{t('cashOption')}</option>
          <option value="BANK_TRANSFER">{t('bankTransferOption')}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="iban">{t('ibanLabel')}</Label>
        <Input id="iban" name="iban" defaultValue={currentIban ?? ''} />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit">{t('saveButton')}</Button>
    </form>
  )
}
