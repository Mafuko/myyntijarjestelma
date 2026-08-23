import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

const SENSITIVE_KEYS = new Set(['password', 'passwordHash', 'iban', 'ibanCiphertext'])

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    clean[key] = SENSITIVE_KEYS.has(key) ? '[redacted]' : value
  }
  return clean
}

export async function writeAuditLog(params: {
  actorUserId: string
  action: string
  targetType: string
  targetId: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: params.actorUserId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata ? (sanitizeMetadata(params.metadata) as Prisma.InputJsonValue) : undefined,
    },
  })
}
