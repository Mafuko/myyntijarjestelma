'use client'

import { useEffect, useState } from 'react'

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
    <div className="p-8">
      <h1 className="text-xl font-semibold">Sales</h1>
      {!connected && <p className="text-amber-600">Reconnecting…</p>}
      <p className="mt-2">
        Total revenue: {snapshot.totalRevenue} € — Commission owed: {snapshot.commissionOwed} €
      </p>

      <h2 className="mt-4 font-medium">Sold ({sold.length})</h2>
      <ul>
        {sold.map((i) => (
          <li key={i.id}>
            {i.name} — {i.price} € — {i.sellerAlias}
          </li>
        ))}
      </ul>

      <h2 className="mt-4 font-medium">Unsold ({listed.length})</h2>
      <ul>
        {listed.map((i) => (
          <li key={i.id}>
            {i.name} — {i.price} € — {i.sellerAlias}
          </li>
        ))}
      </ul>
    </div>
  )
}
