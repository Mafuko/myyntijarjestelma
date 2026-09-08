import { z } from 'zod'

const eventFields = z.object({
  name: z.string().min(1).max(200),
  eventDate: z.coerce.date(),
  eventEndDate: z.coerce.date().optional(),
  registrationDeadline: z.coerce.date(),
  itemEditCutoffDate: z.coerce.date(),
  commissionRate: z.coerce.number().min(0).max(1).optional().default(0.1),
})

const endDateNotBeforeStart = (data: { eventDate?: Date; eventEndDate?: Date }) =>
  !data.eventEndDate || !data.eventDate || data.eventEndDate >= data.eventDate

export const createEventSchema = eventFields.refine(endDateNotBeforeStart, {
  message: 'Event end date must be on or after the event date',
  path: ['eventEndDate'],
})

export const updateEventSchema = eventFields.partial().refine(endDateNotBeforeStart, {
  message: 'Event end date must be on or after the event date',
  path: ['eventEndDate'],
})
