import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireOwner } from '@/lib/services/authz'
import { prisma } from '@/lib/db'

export default async function AuditLogPage() {
  const session = await auth()
  const authz = await requireOwner(session)
  if (!authz.ok) redirect('/events')

  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { actor: true } })

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Audit log</h1>
      <table className="mt-4 text-sm">
        <thead>
          <tr>
            <th className="pr-4 text-left">When</th>
            <th className="pr-4 text-left">Actor</th>
            <th className="pr-4 text-left">Action</th>
            <th className="text-left">Target</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="pr-4">{log.createdAt.toISOString()}</td>
              <td className="pr-4">{log.actor.name}</td>
              <td className="pr-4">{log.action}</td>
              <td>
                {log.targetType}:{log.targetId}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
