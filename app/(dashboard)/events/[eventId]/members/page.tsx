import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { InviteMemberForm } from './InviteMemberForm'
import { CopyInviteLink } from './CopyInviteLink'
import { Badge } from '@/components/ui/badge'

export default async function MembersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['ADMIN'])
  if (!authz.ok) redirect('/events')

  const memberships = await prisma.eventMembership.findMany({ where: { eventId }, include: { user: true } })
  const rowCols = 'sm:grid-cols-[1.3fr_1.5fr_0.7fr_0.8fr]'
  const headerCellClass = 'font-mono text-[11px] uppercase tracking-wide text-muted-foreground'
  const t = await getTranslations('MembersPage')
  const tRoles = await getTranslations('Roles')
  const tStatus = await getTranslations('MembershipStatus')

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-1">
          <div className={`grid grid-cols-1 gap-1 ${rowCols} sm:items-center sm:gap-3 px-3 pb-2`}>
            <span className={headerCellClass}>{t('columnName')}</span>
            <span className={headerCellClass}>{t('columnEmail')}</span>
            <span className={headerCellClass}>{t('columnRole')}</span>
            <span className={headerCellClass}>{t('columnStatus')}</span>
          </div>
          {memberships.map((m) => (
            <div
              key={m.id}
              className={`grid grid-cols-1 gap-1 ${rowCols} sm:items-center sm:gap-3 rounded-md px-3 py-2.5`}
            >
              <span className="text-foreground">{m.user.name}</span>
              <span className="min-w-0 break-all text-muted-foreground">{m.user.email}</span>
              <span className="text-foreground">{tRoles(m.role as 'SELLER' | 'STAFF' | 'ADMIN')}</span>
              <div className="flex flex-col items-start gap-1.5">
                <Badge variant={m.status === 'ACTIVE' ? 'success' : 'destructive'} className="w-fit">
                  {tStatus(m.status as 'ACTIVE' | 'PENDING' | 'REMOVED')}
                </Badge>
                {m.status === 'PENDING' && m.user.inviteToken && (
                  <CopyInviteLink path={`/invite/${m.user.inviteToken}`} />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="lg:border-l lg:border-border lg:pl-8">
          <InviteMemberForm eventId={eventId} />
        </div>
      </div>
    </div>
  )
}
