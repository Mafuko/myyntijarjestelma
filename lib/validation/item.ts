import { z } from 'zod'

export const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.coerce.number().positive().max(100000),
  categoryId: z.string().min(1),
  isAgeRestricted: z.coerce.boolean().optional().default(false),
})

export const updateItemSchema = createItemSchema.partial()
