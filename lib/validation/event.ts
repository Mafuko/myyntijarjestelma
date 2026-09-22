import { z } from 'zod'

const eventFields = z.object({
  name: z.string('EVENT_NAME_REQUIRED').min(1, 'EVENT_NAME_REQUIRED').max(200, 'EVENT_NAME_TOO_LONG'),
  eventDate: z.coerce.date('EVENT_DATE_INVALID'),
  eventEndDate: z.coerce.date('EVENT_END_DATE_INVALID').optional(),
  registrationDeadline: z.coerce.date('REGISTRATION_DEADLINE_INVALID'),
  itemEditCutoffDate: z.coerce.date('ITEM_EDIT_CUTOFF_INVALID'),
  commissionRate: z.coerce.number('COMMISSION_RATE_INVALID').min(0, 'COMMISSION_RATE_TOO_LOW').max(1, 'COMMISSION_RATE_TOO_HIGH').optional().default(0.1),
})

const endDateNotBeforeStart = (data: { eventDate?: Date; eventEndDate?: Date }) =>
  !data.eventEndDate || !data.eventDate || data.eventEndDate >= data.eventDate

export const createEventSchema = eventFields.refine(endDateNotBeforeStart, {
  message: 'EVENT_END_DATE_BEFORE_START',
  path: ['eventEndDate'],
})

export const updateEventSchema = eventFields.partial().refine(endDateNotBeforeStart, {
  message: 'EVENT_END_DATE_BEFORE_START',
  path: ['eventEndDate'],
})
