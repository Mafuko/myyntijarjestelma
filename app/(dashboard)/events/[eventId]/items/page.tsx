import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { listItemsForSeller } from '@/lib/services/items'
import { AddItemForm } from './AddItemForm'
import { AddSeriesForm } from './AddSeriesForm'
import { ItemRow } from './ItemRow'

export default async function ItemsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER', 'STAFF', 'ADMIN'])
  if (!authz.ok) redirect('/events')

  const [event, categories, itemsResult] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
    prisma.category.findMany({ where: { eventId } }),
    listItemsForSeller(session, eventId),
  ])
  const items = itemsResult.ok ? itemsResult.data : []
  const listedIds = items.filter((i) => i.status === 'LISTED').map((i) => i.id)
  // Past the cutoff, only ADMIN/OWNER can still edit — everyone else is
  // stuck with delete-only, matching the server-side rule in updateItem().
  const canEdit = authz.role === 'ADMIN' || authz.role === 'OWNER' || new Date() <= event.itemEditCutoffDate
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
            <ItemRow
              key={item.id}
              item={item}
              eventId={eventId}
              categories={categories}
              canEdit={canEdit}
              rowCols={rowCols}
            />
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
