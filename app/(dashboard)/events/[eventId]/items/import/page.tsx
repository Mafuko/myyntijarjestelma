import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { requireEventAccess } from '@/lib/services/authz'
import { ImportForm } from './ImportForm'

export default async function ImportPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['SELLER'])
  if (!authz.ok) redirect('/events')

  const t = await getTranslations('ImportPage')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('instructions')}
        </p>
      </div>
      <ImportForm eventId={eventId} />
    </div>
  )
}
