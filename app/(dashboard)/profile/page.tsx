import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getOwnPayoutInfo } from '@/lib/services/profile'
import { PayoutInfoForm } from './PayoutInfoForm'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const info = await getOwnPayoutInfo(session)
  const current = info.ok ? info.data : { payoutMethod: null, iban: null }

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Payout information</h1>
      <PayoutInfoForm currentPayoutMethod={current.payoutMethod} currentIban={current.iban} />
    </div>
  )
}
