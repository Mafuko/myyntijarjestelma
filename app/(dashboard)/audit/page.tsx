import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { requireOwner } from '@/lib/services/authz'
import { prisma } from '@/lib/db'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function AuditLogPage() {
  const session = await auth()
  const authz = await requireOwner(session)
  if (!authz.ok) redirect('/events')

  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { actor: true } })
  const t = await getTranslations('AuditPage')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columnWhen')}</TableHead>
            <TableHead>{t('columnActor')}</TableHead>
            <TableHead>{t('columnAction')}</TableHead>
            <TableHead>{t('columnTarget')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{log.createdAt.toISOString()}</TableCell>
              <TableCell>{log.actor.name}</TableCell>
              <TableCell>{log.action}</TableCell>
              <TableCell>
                {log.targetType}:{log.targetId}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
