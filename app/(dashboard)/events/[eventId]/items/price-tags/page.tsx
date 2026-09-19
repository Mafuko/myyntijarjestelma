import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { generatePriceTagData } from '@/lib/services/price-tags'

export default async function PriceTagPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ itemIds?: string }>
}) {
  const { eventId } = await params
  const { itemIds: itemIdsParam } = await searchParams
  const itemIds = itemIdsParam ? itemIdsParam.split(',').filter(Boolean) : []

  if (itemIds.length === 0) redirect(`/events/${eventId}/items`)

  const session = await auth()
  const result = await generatePriceTagData(session, eventId, itemIds)
  if (!result.ok) redirect(`/events/${eventId}/items`)

  const t = await getTranslations('PriceTagPreviewPage')
  const src = `/api/price-tags/${eventId}?itemIds=${itemIds.join(',')}`

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('itemCount', { count: result.data.length })}</p>
      <iframe src={src} className="h-[70vh] w-full rounded-md border border-border" title={t('title')} />
      <a href={`${src}&download=1`} className="w-fit text-sm text-primary underline-offset-4 hover:underline">
        {t('downloadButton')}
      </a>
    </div>
  )
}
