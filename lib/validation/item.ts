import { z } from 'zod'

export const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.coerce.number().positive().max(100000),
  categoryId: z.string().min(1),
  isAgeRestricted: z.coerce.boolean().optional().default(false),
})

export const updateItemSchema = createItemSchema.partial()

export const createItemBatchSchema = z
  .object({
    baseName: z.string().min(1).max(180),
    startVolume: z.coerce.number().int().positive(),
    endVolume: z.coerce.number().int().positive(),
    price: z.coerce.number().positive().max(100000),
    categoryId: z.string().min(1),
    isAgeRestricted: z.coerce.boolean().optional().default(false),
    mode: z.enum(['series', 'bundle']),
  })
  .refine((data) => data.endVolume >= data.startVolume, {
    message: 'End volume must be greater than or equal to start volume',
    path: ['endVolume'],
  })
  .refine((data) => data.endVolume - data.startVolume + 1 <= 50, {
    message: 'A series or bundle can cover at most 50 volumes',
    path: ['endVolume'],
  })
