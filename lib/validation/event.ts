import { z } from 'zod'

export const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  eventDate: z.coerce.date(),
  registrationDeadline: z.coerce.date(),
  itemEditCutoffDate: z.coerce.date(),
  commissionRate: z.coerce.number().min(0).max(1).optional().default(0.1),
})

export const updateEventSchema = createEventSchema.partial()
