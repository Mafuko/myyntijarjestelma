import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string('INVALID_EMAIL').trim().toLowerCase().email('INVALID_EMAIL'),
  password: z.string('PASSWORD_REQUIRED').min(1, 'PASSWORD_REQUIRED'),
})

export const inviteUserSchema = z
  .object({
    name: z.string('NAME_REQUIRED').min(1, 'NAME_REQUIRED').max(100, 'NAME_TOO_LONG'),
    email: z.string('INVALID_EMAIL').trim().toLowerCase().email('INVALID_EMAIL'),
    role: z.enum(['SELLER', 'STAFF', 'ADMIN'], 'INVALID_ROLE'),
    eventId: z.string('EVENT_ID_REQUIRED').min(1, 'EVENT_ID_REQUIRED'),
    sellerAlias: z.string('SELLER_ALIAS_REQUIRED').min(1, 'SELLER_ALIAS_REQUIRED').max(50, 'SELLER_ALIAS_TOO_LONG').optional(),
  })
  .refine((data) => data.role !== 'SELLER' || !!data.sellerAlias, {
    message: 'SELLER_ALIAS_REQUIRED_FOR_ROLE',
    path: ['sellerAlias'],
  })

export const acceptInviteSchema = z.object({
  token: z.string('TOKEN_REQUIRED').min(1, 'TOKEN_REQUIRED'),
  password: z.string('PASSWORD_TOO_SHORT').min(10, 'PASSWORD_TOO_SHORT'),
})

export const signupSchema = z.object({
  name: z.string('NAME_REQUIRED').min(1, 'NAME_REQUIRED').max(100, 'NAME_TOO_LONG'),
  email: z.string('INVALID_EMAIL').trim().toLowerCase().email('INVALID_EMAIL'),
  password: z.string('PASSWORD_TOO_SHORT').min(10, 'PASSWORD_TOO_SHORT'),
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
    payoutMethod: z.enum(['CASH', 'BANK_TRANSFER'], 'INVALID_PAYOUT_METHOD'),
    iban: z.string('IBAN_REQUIRED').optional(),
  })
  .refine((data) => data.payoutMethod !== 'BANK_TRANSFER' || (!!data.iban && isValidIban(data.iban)), {
    message: 'IBAN_REQUIRED',
    path: ['iban'],
  })
