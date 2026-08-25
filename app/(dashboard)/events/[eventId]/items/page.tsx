import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { listItemsForSeller } from '@/lib/services/items'
import { deleteItem } from '@/actions/items'
import { AddItemForm } from './AddItemForm'
import { Button } from '@/components/ui/button'
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

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">My items</h1>

        {listedIds.length > 0 && (
          <a
            href={`/api/price-tags/${eventId}?itemIds=${listedIds.join(',')}`}
            className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
          >
            Print all price tags
          </a>
        )}

        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <span className="text-foreground">
                {item.name} — {item.price} €
              </span>
              <Badge variant={item.status === 'SOLD' ? 'success' : 'secondary'}>{item.status}</Badge>
              {item.status === 'LISTED' && (
                <form
                  action={async () => {
                    'use server'
                    await deleteItem(item.id, eventId)
                  }}
                >
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              )}
              {item.status === 'LISTED' && (
                <a
                  href={`/api/price-tags/${eventId}?itemIds=${item.id}`}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Price tag
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>

      <AddItemForm eventId={eventId} categories={categories} />
    </div>
  )
}
