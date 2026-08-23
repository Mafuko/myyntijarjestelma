import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { requireOwner } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { deleteUserPii } from '@/actions/users'

export default async function AdminPage() {
  const session = await auth()
  const authz = await requireOwner(session)
  if (!authz.ok) redirect('/events')

  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } })

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Admin</h1>
      <Link href="/audit" className="underline">
        View audit log
      </Link>

      <table className="mt-4 text-sm">
        <thead>
          <tr>
            <th className="pr-4 text-left">Name</th>
            <th className="pr-4 text-left">Email</th>
            <th className="text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="pr-4">{u.name}</td>
              <td className="pr-4">{u.email}</td>
              <td>
                {!u.isOwner && (
                  <form
                    action={async () => {
                      'use server'
                      await deleteUserPii(u.id)
                    }}
                  >
                    <button type="submit" className="text-sm text-red-600 underline">
                      Delete PII
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
