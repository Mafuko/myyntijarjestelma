'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { setTheme } from '@/actions/theme'
import { useTheme } from '@/components/ThemeProvider'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const theme = useTheme()
  const t = useTranslations('ThemeToggle')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClick() {
    const next = theme === 'dark' ? 'light' : 'dark'
    startTransition(async () => {
      await setTheme(next)
      router.refresh()
    })
  }

  const label = theme === 'dark' ? t('switchToLight') : t('switchToDark')

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={handleClick}
      title={label}
      aria-label={label}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </Button>
  )
}
