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
