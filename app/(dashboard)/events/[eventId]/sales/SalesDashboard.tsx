'use client'

import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

type SalesSnapshotItem = { id: string; name: string; price: string; status: string; sellerAlias: string }
type SalesSnapshot = { items: SalesSnapshotItem[]; totalRevenue: string; commissionOwed: string }

export function SalesDashboard({ eventId, initialSnapshot }: { eventId: string; initialSnapshot: SalesSnapshot }) {
  const [snapshot, setSnapshot] = useState<SalesSnapshot>(initialSnapshot)
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    const source = new EventSource(`/api/sse/${eventId}`)
    source.onmessage = (event) => {
      setSnapshot(JSON.parse(event.data))
      setConnected(true)
    }
    source.onerror = () => {
      setConnected(false)
    }
    return () => source.close()
  }, [eventId])

  const sold = snapshot.items.filter((i) => i.status === 'SOLD')
  const listed = snapshot.items.filter((i) => i.status === 'LISTED')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Sales</h1>
        {!connected && (
          <Alert variant="warning" className="mt-2 max-w-sm">
            <AlertDescription>Reconnecting…</AlertDescription>
          </Alert>
        )}
        <p className="mt-2 text-foreground">
          Total revenue: {snapshot.totalRevenue} € — Commission owed: {snapshot.commissionOwed} €
        </p>
      </div>

      <div>
        <h2 className="font-medium text-foreground">Sold ({sold.length})</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {sold.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-foreground">
              <span>
                {i.name} — {i.price} € — {i.sellerAlias}
              </span>
              <Badge variant="success">Sold</Badge>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="font-medium text-foreground">Unsold ({listed.length})</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {listed.map((i) => (
            <li key={i.id} className="text-foreground">
              {i.name} — {i.price} € — {i.sellerAlias}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
