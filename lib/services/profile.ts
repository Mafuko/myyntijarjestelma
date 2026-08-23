import { prisma } from '@/lib/db'
import { encryptIban, decryptIban } from '@/lib/crypto'
import { payoutInfoSchema } from '@/lib/validation/user'

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
type MinimalSession = { user?: { id?: string | null } | null } | null

export async function updatePayoutInfo(session: MinimalSession, input: unknown): Promise<Result<{}>> {
  const userId = session?.user?.id
  if (!userId) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }
  }

  const parsed = payoutInfoSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      payoutMethod: parsed.data.payoutMethod,
      ibanCiphertext: parsed.data.iban ? encryptIban(parsed.data.iban) : null,
    },
  })

  return { ok: true, data: {} }
}

export async function getOwnPayoutInfo(
  session: MinimalSession
): Promise<Result<{ payoutMethod: string | null; iban: string | null }>> {
  const userId = session?.user?.id
  if (!userId) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } }
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  return {
    ok: true,
    data: {
      payoutMethod: user.payoutMethod,
      iban: user.ibanCiphertext ? decryptIban(user.ibanCiphertext) : null,
    },
  }
}
