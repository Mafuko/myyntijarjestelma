'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { deleteItem } from '@/actions/items'
import { Button } from '@/components/ui/button'

export function DeleteItemButton({ itemId, eventId }: { itemId: string; eventId: string }) {
  const t = useTranslations('DeleteItemButton')
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(async () => {
        await deleteItem(itemId, eventId)
      })}
    >
      {pending ? t('deleting') : t('delete')}
    </Button>
  )
}
