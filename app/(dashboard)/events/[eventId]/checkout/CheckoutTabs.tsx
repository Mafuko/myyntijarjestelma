'use client'

import { useState } from 'react'
import { CheckoutScanner } from './CheckoutScanner'
import { SellBySeller, type Item, type SellerLabel } from './SellBySeller'
import { Button } from '@/components/ui/button'

export function CheckoutTabs({
  eventId,
  items,
  sellers,
}: {
  eventId: string
  items: Item[]
  sellers: SellerLabel[]
}) {
  const [mode, setMode] = useState<'scan' | 'browse'>('scan')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'scan' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('scan')}
        >
          Scan
        </Button>
        <Button
          type="button"
          variant={mode === 'browse' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('browse')}
        >
          Sell by seller
        </Button>
      </div>
      {mode === 'scan' ? (
        <CheckoutScanner eventId={eventId} />
      ) : (
        <SellBySeller eventId={eventId} items={items} sellers={sellers} />
      )}
    </div>
  )
}
