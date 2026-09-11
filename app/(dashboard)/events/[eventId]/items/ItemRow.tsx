'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updateItem } from '@/actions/items'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DeleteItemButton } from './DeleteItemButton'
import { cn } from '@/lib/utils'

type Category = { id: string; name: string }
type Item = {
  id: string
  name: string
  price: string
  status: string
  categoryId: string
  isAgeRestricted: boolean
}

export function ItemRow({
  item,
  eventId,
  categories,
  canEdit,
  rowCols,
}: {
  item: Item
  eventId: string
  categories: Category[]
  canEdit: boolean
  rowCols: string
}) {
  const t = useTranslations('ItemRow')
  const tStatus = useTranslations('ItemStatus')
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(item.name)
  const [price, setPrice] = useState(item.price)
  const [categoryId, setCategoryId] = useState(item.categoryId)
  const [isAgeRestricted, setIsAgeRestricted] = useState(item.isAgeRestricted)

  function handleSave() {
    const formData = new FormData()
    formData.set('name', name)
    formData.set('price', price)
    formData.set('categoryId', categoryId)
    if (isAgeRestricted) formData.set('isAgeRestricted', 'on')

    startTransition(async () => {
      const result = await updateItem(item.id, eventId, formData)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setError(null)
      setIsEditing(false)
    })
  }

  function handleCancel() {
    setName(item.name)
    setPrice(item.price)
    setCategoryId(item.categoryId)
    setIsAgeRestricted(item.isAgeRestricted)
    setError(null)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div data-testid="item-edit-form" className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_0.6fr_1fr]">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} required />
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            type="number"
            step="0.01"
            min="0.01"
            placeholder={t('pricePlaceholder')}
            required
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={cn(
              'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isAgeRestricted}
            onChange={(e) => setIsAgeRestricted(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          {t('k18Label')}
        </label>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={handleSave}>
            {pending ? t('saving') : t('save')}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleCancel}>
            {t('cancel')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-1 gap-1 ${rowCols} sm:items-center sm:gap-3 rounded-md px-3 py-2.5`}>
      <span className="min-w-0 break-words text-foreground">{item.name}</span>
      <span className="text-foreground">{item.price} €</span>
      <Badge variant={item.status === 'SOLD' ? 'success' : 'secondary'} className="w-fit">
        {tStatus(item.status as 'LISTED' | 'SOLD')}
      </Badge>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {item.status === 'LISTED' && canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            {t('edit')}
          </Button>
        )}
        {item.status === 'LISTED' && <DeleteItemButton itemId={item.id} eventId={eventId} />}
        {item.status === 'LISTED' && (
          <a
            href={`/api/price-tags/${eventId}?itemIds=${item.id}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            {t('priceTagLink')}
          </a>
        )}
      </div>
    </div>
  )
}
