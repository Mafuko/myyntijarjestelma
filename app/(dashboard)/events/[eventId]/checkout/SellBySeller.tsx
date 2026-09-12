'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { confirmSale, undoSale } from '@/actions/sales'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

export type Item = { id: string; name: string; price: string; status: string; sellerId: string }
export type SellerLabel = { userId: string; label: string }

function SellableItemRow({ eventId, item }: { eventId: string; item: Item }) {
  const t = useTranslations('SellBySeller')
  const tStatus = useTranslations('ItemStatus')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSell() {
    startTransition(async () => {
      const result = await confirmSale(eventId, item.id, 'MANUAL_OVERRIDE')
      setError(result.ok ? null : result.error.message)
    })
  }

  function handleUndo() {
    startTransition(async () => {
      const result = await undoSale(eventId, item.id)
      setError(result.ok ? null : result.error.message)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-[2fr_0.6fr_0.8fr_1fr] sm:items-center sm:gap-3 rounded-md px-3 py-2.5">
        <span className="min-w-0 break-words text-foreground">{item.name}</span>
        <span className="text-foreground">{item.price} €</span>
        <Badge variant={item.status === 'SOLD' ? 'success' : 'secondary'} className="w-fit">
          {tStatus(item.status as 'LISTED' | 'SOLD')}
        </Badge>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {item.status === 'LISTED' && (
            <Button type="button" size="sm" disabled={pending} onClick={handleSell}>
              {pending ? t('selling') : t('sell')}
            </Button>
          )}
          {item.status === 'SOLD' && (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleUndo}>
              {pending ? t('undoing') : t('undoSale')}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export function SellBySeller({
  eventId,
  items,
  sellers,
}: {
  eventId: string
  items: Item[]
  sellers: SellerLabel[]
}) {
  const t = useTranslations('SellBySeller')
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null)

  const labelBySellerId = useMemo(() => new Map(sellers.map((s) => [s.userId, s.label])), [sellers])

  const sellerRows = useMemo(() => {
    const grouped = new Map<string, { listedCount: number; soldCount: number }>()
    for (const item of items) {
      const entry = grouped.get(item.sellerId) ?? { listedCount: 0, soldCount: 0 }
      if (item.status === 'LISTED') entry.listedCount++
      else if (item.status === 'SOLD') entry.soldCount++
      grouped.set(item.sellerId, entry)
    }
    return [...grouped.entries()]
      .map(([sellerId, counts]) => ({
        userId: sellerId,
        label: labelBySellerId.get(sellerId) ?? t('unknownSeller'),
        ...counts,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [items, labelBySellerId, t])

  if (selectedSellerId === null) {
    return (
      <div className="flex flex-col gap-1">
        {sellerRows.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('noItemsYet')}</p>
        )}
        {sellerRows.map((s) => (
          <button
            key={s.userId}
            type="button"
            onClick={() => setSelectedSellerId(s.userId)}
            className="flex items-center justify-between rounded-md px-3 py-2.5 text-left text-foreground hover:bg-muted"
          >
            <span>{s.label}</span>
            <span className="text-sm text-muted-foreground">
              {t('listedAndSold', { listedCount: s.listedCount, soldCount: s.soldCount })}
            </span>
          </button>
        ))}
      </div>
    )
  }

  const selectedLabel = labelBySellerId.get(selectedSellerId) ?? t('unknownSeller')
  const theirItems = items.filter((i) => i.sellerId === selectedSellerId)

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setSelectedSellerId(null)}
      >
        {t('backToSellers')}
      </Button>
      <h2 className="text-lg font-semibold text-foreground">{selectedLabel}</h2>
      <div className="flex flex-col gap-1">
        {theirItems.map((item) => (
          <SellableItemRow key={item.id} eventId={eventId} item={item} />
        ))}
      </div>
    </div>
  )
}
