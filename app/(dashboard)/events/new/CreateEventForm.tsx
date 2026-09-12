'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createEvent } from '@/actions/events'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

function dayAfter(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

export function CreateEventForm() {
  const t = useTranslations('CreateEventForm')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [eventDate, setEventDate] = useState('')
  const [multiDay, setMultiDay] = useState(false)
  const [eventEndDate, setEventEndDate] = useState('')

  function handleMultiDayChange(checked: boolean) {
    setMultiDay(checked)
    if (checked) {
      setEventEndDate(eventDate ? dayAfter(eventDate) : '')
    }
  }

  async function handleSubmit(formData: FormData) {
    setPending(true)
    const result = await createEvent(formData)
    if (!result.ok) {
      setError(result.error.message)
      setPending(false)
      return
    }
    window.location.href = `/events/${result.data.eventId}`
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <Input name="name" placeholder={t('eventNamePlaceholder')} required />
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="eventDate">{t('eventDateLabel')}</Label>
        <Input
          id="eventDate"
          name="eventDate"
          type="date"
          required
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={multiDay}
          onChange={(e) => handleMultiDayChange(e.target.checked)}
        />
        {t('multipleDaysLabel')}
      </label>
      {multiDay && (
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="eventEndDate">{t('eventEndDateLabel')}</Label>
          <Input
            id="eventEndDate"
            name="eventEndDate"
            type="date"
            required
            value={eventEndDate}
            onChange={(e) => setEventEndDate(e.target.value)}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="registrationDeadline">{t('registrationDeadlineLabel')}</Label>
        <Input id="registrationDeadline" name="registrationDeadline" type="date" required />
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="itemEditCutoffDate">{t('itemEditCutoffLabel')}</Label>
        <Input id="itemEditCutoffDate" name="itemEditCutoffDate" type="date" required />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending}>{t('submitButton')}</Button>
    </form>
  )
}
