import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { generatePriceTagData, renderPriceTagsPdf } from '@/lib/services/price-tags'

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const itemIdsParam = request.nextUrl.searchParams.get('itemIds')
  if (!itemIdsParam) {
    return NextResponse.json({ error: 'itemIds query parameter is required' }, { status: 400 })
  }
  const itemIds = itemIdsParam.split(',').filter(Boolean)

  const result = await generatePriceTagData(session, eventId, itemIds)
  if (!result.ok) {
    const status = result.error.code === 'UNAUTHENTICATED' ? 401 : result.error.code === 'FORBIDDEN' ? 403 : 400
    return NextResponse.json({ error: result.error.message }, { status })
  }

  const cookieStore = await cookies()
  const locale = cookieStore.get('NEXT_LOCALE')?.value === 'fi' ? 'fi' : 'en'
  const t = await getTranslations({ locale, namespace: 'Common' })

  const pdfBuffer = await renderPriceTagsPdf(result.data, t('unknownSeller'))
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="price-tags.pdf"',
    },
  })
}
