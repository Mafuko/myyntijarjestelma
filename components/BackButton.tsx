'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export function BackButton() {
  const router = useRouter()
  const t = useTranslations('A11y')

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label={t('back')}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-90"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  )
}
