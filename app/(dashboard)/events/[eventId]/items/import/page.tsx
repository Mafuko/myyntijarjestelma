import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { ImportForm } from './ImportForm'

export default async function ImportPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) redirect('/events')

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Import items from a spreadsheet</h1>
      <p className="mt-2 text-sm text-gray-600">
        Export your Google Sheet as CSV or XLSX with columns: Tavara, Hinta, Tyyppi, K-18.
      </p>
      <div className="mt-6">
        <ImportForm eventId={eventId} />
      </div>
    </div>
  )
}
