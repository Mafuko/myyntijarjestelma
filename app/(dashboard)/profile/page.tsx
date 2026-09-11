import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { getOwnPayoutInfo } from '@/lib/services/profile'
import { PayoutInfoForm } from './PayoutInfoForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const info = await getOwnPayoutInfo(session)
  const current = info.ok ? info.data : { payoutMethod: null, iban: null }
  const t = await getTranslations('ProfilePage')

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <PayoutInfoForm currentPayoutMethod={current.payoutMethod} currentIban={current.iban} />
      </CardContent>
    </Card>
  )
}
