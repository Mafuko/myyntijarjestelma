import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireEventAccess } from '@/lib/services/authz'
import { inviteMember } from '@/actions/events'

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

      <form
        action={async (formData) => {
          'use server'
          await inviteMember(eventId, formData)
        }}
        className="mt-8 flex max-w-sm flex-col gap-3"
      >
        <h2 className="font-medium">Invite a member</h2>
        <input name="name" placeholder="Name" required className="rounded border px-2 py-1" />
        <input name="email" type="email" placeholder="Email" required className="rounded border px-2 py-1" />
        <select name="role" required className="rounded border px-2 py-1">
          <option value="SELLER">Myyjä</option>
          <option value="STAFF">Työvoima</option>
          <option value="ADMIN">Ylläpitäjä</option>
        </select>
        <input name="sellerAlias" placeholder="Seller alias (required for Myyjä)" className="rounded border px-2 py-1" />
        <button type="submit" className="rounded bg-black px-4 py-2 text-white">
          Invite
        </button>
      </form>
    </div>
  )
}
