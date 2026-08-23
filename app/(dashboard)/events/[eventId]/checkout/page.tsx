import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { CheckoutScanner } from './CheckoutScanner'

export default async function CheckoutPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['STAFF', 'ADMIN'])
  if (!authz.ok) redirect('/events')

  return <CheckoutScanner eventId={eventId} />
}
