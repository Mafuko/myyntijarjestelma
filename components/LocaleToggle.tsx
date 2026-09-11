'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { setLocale } from '@/actions/locale'
import { Button } from '@/components/ui/button'

export function LocaleToggle() {
  const locale = useLocale()
  const t = useTranslations('LocaleToggle')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClick() {
    const next = locale === 'en' ? 'fi' : 'en'
    startTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleClick}>
      {locale === 'en' ? '🇫🇮' : '🇬🇧'} {t('switchToOther')}
    </Button>
  )
}
