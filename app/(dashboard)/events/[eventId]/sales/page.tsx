import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { getSalesSnapshot } from '@/lib/services/sales-dashboard'
import { SalesDashboard } from './SalesDashboard'

export default async function SalesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER', 'STAFF', 'ADMIN'])
  if (!authz.ok) redirect('/events')

  const snapshot = await getSalesSnapshot(session, eventId)
  if (!snapshot.ok) redirect('/events')

  return <SalesDashboard eventId={eventId} initialSnapshot={snapshot.data} />
}
