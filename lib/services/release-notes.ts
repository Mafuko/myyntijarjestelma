import { prisma } from '@/lib/db'

export type ReleaseNote = { date: string; minRole?: 'SELLER' | 'STAFF' | 'ADMIN'; en: string; fi: string }
type EffectiveRole = 'SELLER' | 'STAFF' | 'ADMIN' | 'OWNER'

const ROLE_RANK: Record<EffectiveRole, number> = { SELLER: 0, STAFF: 1, ADMIN: 2, OWNER: 3 }

export function selectVisibleNote(
  notes: ReleaseNote[],
  effectiveRole: EffectiveRole,
  lastSeenDate: string | null
): ReleaseNote | null {
  const visible = notes.filter((n) => ROLE_RANK[n.minRole ?? 'SELLER'] <= ROLE_RANK[effectiveRole])
  const latest = visible[0] ?? null
  if (latest && latest.date === lastSeenDate) return null
  return latest
}

export async function getEffectiveRole(userId: string): Promise<EffectiveRole> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { isOwner: true } })
  if (user.isOwner) return 'OWNER'

  const memberships = await prisma.eventMembership.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { role: true },
  })
  return memberships.reduce<EffectiveRole>(
    (highest, m) => (ROLE_RANK[m.role] > ROLE_RANK[highest] ? m.role : highest),
    'SELLER'
  )
}

export async function getLatestVisibleReleaseNote(userId: string): Promise<ReleaseNote | null> {
  const notes: ReleaseNote[] = (await import('@/messages/release-notes.json')).default as ReleaseNote[]
  const effectiveRole = await getEffectiveRole(userId)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { lastSeenReleaseNoteDate: true } })
  return selectVisibleNote(notes, effectiveRole, user.lastSeenReleaseNoteDate)
}

export async function markReleaseNoteSeen(userId: string, date: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastSeenReleaseNoteDate: date } })
}
