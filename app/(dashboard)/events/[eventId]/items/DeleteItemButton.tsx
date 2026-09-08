'use client'

import { useTransition } from 'react'
import { deleteItem } from '@/actions/items'
import { Button } from '@/components/ui/button'

export function DeleteItemButton({ itemId, eventId }: { itemId: string; eventId: string }) {
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
      {pending ? 'Deleting…' : 'Delete'}
    </Button>
  )
}
