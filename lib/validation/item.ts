import { z } from 'zod'

export const createItemSchema = z.object({
  name: z.string('ITEM_NAME_REQUIRED').min(1, 'ITEM_NAME_REQUIRED').max(200, 'ITEM_NAME_TOO_LONG'),
  price: z.coerce.number('PRICE_INVALID').positive('PRICE_MUST_BE_POSITIVE').max(100000, 'PRICE_TOO_HIGH'),
  categoryId: z.string('CATEGORY_REQUIRED').min(1, 'CATEGORY_REQUIRED'),
  isAgeRestricted: z.coerce.boolean().optional().default(false),
})

export const updateItemSchema = createItemSchema.partial()

export const createItemBatchSchema = z
  .object({
    baseName: z.string('BATCH_BASE_NAME_REQUIRED').min(1, 'BATCH_BASE_NAME_REQUIRED').max(180, 'BATCH_BASE_NAME_TOO_LONG'),
    startVolume: z.coerce.number('BATCH_START_VOLUME_INVALID').int('BATCH_START_VOLUME_INVALID').positive('BATCH_START_VOLUME_MUST_BE_POSITIVE'),
    endVolume: z.coerce.number('BATCH_END_VOLUME_INVALID').int('BATCH_END_VOLUME_INVALID').positive('BATCH_END_VOLUME_MUST_BE_POSITIVE'),
    price: z.coerce.number('PRICE_INVALID').positive('PRICE_MUST_BE_POSITIVE').max(100000, 'PRICE_TOO_HIGH'),
    categoryId: z.string('CATEGORY_REQUIRED').min(1, 'CATEGORY_REQUIRED'),
    isAgeRestricted: z.coerce.boolean().optional().default(false),
    mode: z.enum(['series', 'bundle'], 'INVALID_MODE'),
  })
  .refine((data) => data.endVolume >= data.startVolume, {
    message: 'BATCH_END_BEFORE_START',
    path: ['endVolume'],
  })
  .refine((data) => data.endVolume - data.startVolume + 1 <= 50, {
    message: 'BATCH_TOO_MANY_VOLUMES',
    path: ['endVolume'],
  })
