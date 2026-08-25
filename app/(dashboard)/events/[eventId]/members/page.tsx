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

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Members</h1>
        <ul className="mt-4 flex flex-col gap-2">
          {memberships.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-foreground">
              <span>
                {m.user.name} ({m.user.email}) — {m.role}
              </span>
              <Badge variant={m.status === 'ACTIVE' ? 'success' : 'secondary'}>{m.status}</Badge>
            </li>
          ))}
        </ul>
      </div>

      <InviteMemberForm eventId={eventId} />
    </div>
  )
}
