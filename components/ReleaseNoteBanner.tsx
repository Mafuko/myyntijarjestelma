'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { dismissReleaseNote } from '@/actions/release-notes'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function ReleaseNoteBanner({ date, text }: { date: string; text: string }) {
  const t = useTranslations('ReleaseNoteBanner')
  const [dismissed, setDismissed] = useState(false)
  const [pending, startTransition] = useTransition()

  if (dismissed) return null

  function handleDismiss() {
    setDismissed(true)
    startTransition(async () => {
      await dismissReleaseNote(date)
    })
  }

  return (
    <Alert className="mb-4">
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{text}</span>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleDismiss}>
          {t('dismiss')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
