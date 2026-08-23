import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { listItemsForSeller } from '@/lib/services/items'
import { deleteItem } from '@/actions/items'
import { AddItemForm } from './AddItemForm'

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

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">My items</h1>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <span>
              {item.name} — {item.price} € — {item.status}
            </span>
            {item.status === 'LISTED' && (
              <form
                action={async () => {
                  'use server'
                  await deleteItem(item.id, eventId)
                }}
              >
                <button type="submit" className="text-sm text-red-600 underline">
                  Delete
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <AddItemForm eventId={eventId} categories={categories} />
    </div>
  )
}
