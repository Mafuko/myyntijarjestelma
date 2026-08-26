import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { InviteMemberForm } from './InviteMemberForm'
import { Badge } from '@/components/ui/badge'

export default async function MembersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['ADMIN'])
  if (!authz.ok) redirect('/events')

  const memberships = await prisma.eventMembership.findMany({ where: { eventId }, include: { user: true } })
  const rowCols = 'grid-cols-[1.3fr_1.5fr_0.7fr_0.8fr]'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Members</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-1">
          <div className={`grid ${rowCols} gap-3 px-3 pb-2`}>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Name</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Email</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Role</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Status</span>
          </div>
          {memberships.map((m) => (
            <div key={m.id} className={`grid ${rowCols} items-center gap-3 rounded-md px-3 py-2.5`}>
              <span className="text-foreground">{m.user.name}</span>
              <span className="text-muted-foreground">{m.user.email}</span>
              <span className="text-foreground">{m.role}</span>
              <Badge variant={m.status === 'ACTIVE' ? 'success' : 'destructive'} className="w-fit">
                {m.status}
              </Badge>
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
