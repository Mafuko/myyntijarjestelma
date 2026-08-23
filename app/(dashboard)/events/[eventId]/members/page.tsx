import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { InviteMemberForm } from './InviteMemberForm'

export default async function MembersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const session = await auth()
  const authz = await requireEventAccess(session, eventId, ['ADMIN'])
  if (!authz.ok) redirect('/events')

  const memberships = await prisma.eventMembership.findMany({ where: { eventId }, include: { user: true } })

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Members</h1>
      <ul className="mt-4 flex flex-col gap-1">
        {memberships.map((m) => (
          <li key={m.id}>
            {m.user.name} ({m.user.email}) — {m.role} — {m.status}
          </li>
        ))}
      </ul>

      <InviteMemberForm eventId={eventId} />
    </div>
  )
}
