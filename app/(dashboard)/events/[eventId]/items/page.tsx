import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { listItemsForSeller } from '@/lib/services/items'
import { AddItemForm } from './AddItemForm'
import { AddSeriesForm } from './AddSeriesForm'
import { DeleteItemButton } from './DeleteItemButton'
import { Badge } from '@/components/ui/badge'

export default async function ItemsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) redirect('/events')

  const [categories, itemsResult] = await Promise.all([
    prisma.category.findMany({ where: { eventId } }),
    listItemsForSeller(session, eventId),
  ])
  const items = itemsResult.ok ? itemsResult.data : []
  const listedIds = items.filter((i) => i.status === 'LISTED').map((i) => i.id)
  const rowCols = 'sm:grid-cols-[2fr_0.6fr_0.8fr_1fr]'
  const headerCellClass = 'font-mono text-[11px] uppercase tracking-wide text-muted-foreground'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">My items</h1>
        {listedIds.length > 0 && (
          <a
            href={`/api/price-tags/${eventId}?itemIds=${listedIds.join(',')}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Print all price tags
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-1">
          <div className={`grid grid-cols-1 gap-1 ${rowCols} sm:items-center sm:gap-3 px-3 pb-2`}>
            <span className={headerCellClass}>Item</span>
            <span className={headerCellClass}>Price</span>
            <span className={headerCellClass}>Status</span>
            <span className={headerCellClass}>Actions</span>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className={`grid grid-cols-1 gap-1 ${rowCols} sm:items-center sm:gap-3 rounded-md px-3 py-2.5`}
            >
              <span className="min-w-0 break-words text-foreground">{item.name}</span>
              <span className="text-foreground">{item.price} €</span>
              <Badge variant={item.status === 'SOLD' ? 'success' : 'secondary'} className="w-fit">
                {item.status}
              </Badge>
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                {item.status === 'LISTED' && <DeleteItemButton itemId={item.id} eventId={eventId} />}
                {item.status === 'LISTED' && (
                  <a
                    href={`/api/price-tags/${eventId}?itemIds=${item.id}`}
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Price tag
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-6 lg:border-l lg:border-border lg:pl-8">
          <AddItemForm eventId={eventId} categories={categories} />
          <AddSeriesForm eventId={eventId} categories={categories} />
        </div>
      </div>
    </div>
  )
}
