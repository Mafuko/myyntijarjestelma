import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const inviteUserSchema = z
  .object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    role: z.enum(['SELLER', 'STAFF', 'ADMIN']),
    eventId: z.string().min(1),
    sellerAlias: z.string().min(1).max(50).optional(),
  })
  .refine((data) => data.role !== 'SELLER' || !!data.sellerAlias, {
    message: 'sellerAlias is required for the SELLER role',
    path: ['sellerAlias'],
  })

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(10, 'Password must be at least 10 characters'),
})

export function isValidIban(iban: string): boolean {
  const normalized = iban.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(normalized)) return false

  const rearranged = normalized.slice(4) + normalized.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55))

  let remainder = 0
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97
  }
  return remainder === 1
}

export const payoutInfoSchema = z
  .object({
    payoutMethod: z.enum(['CASH', 'BANK_TRANSFER']),
    iban: z.string().optional(),
  })
  .refine((data) => data.payoutMethod !== 'BANK_TRANSFER' || (!!data.iban && isValidIban(data.iban)), {
    message: 'A valid IBAN is required for bank transfer payout',
    path: ['iban'],
  })
