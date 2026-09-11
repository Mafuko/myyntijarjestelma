'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createItemBatch } from '@/actions/items'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

type Category = { id: string; name: string }

export function AddSeriesForm({ eventId, categories }: { eventId: string; categories: Category[] }) {
  const t = useTranslations('AddSeriesForm')
  const [error, setError] = useState<string | null>(null)
  // Category, K-18, and mode stay controlled/sticky across submissions,
  // matching AddItemForm's quick-repeat behavior — a seller adding several
  // series/bundles in a row (e.g. "Naruto Vol. 1-4" then "Bleach Vol. 1-10")
  // usually wants the same category/mode again, not to re-pick it each time.
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [isAgeRestricted, setIsAgeRestricted] = useState(false)
  const [mode, setMode] = useState<'series' | 'bundle'>('series')
  const baseNameRef = useRef<HTMLInputElement>(null)
  const startVolumeRef = useRef<HTMLInputElement>(null)
  const endVolumeRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)

  // onSubmit + preventDefault, not the action prop, for the same reason as
  // AddItemForm: the action prop's automatic form reset on success would
  // wipe the controlled category/K-18/mode state at the DOM level.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const result = await createItemBatch(eventId, formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
    if (baseNameRef.current) baseNameRef.current.value = ''
    if (startVolumeRef.current) startVolumeRef.current.value = ''
    if (endVolumeRef.current) endVolumeRef.current.value = ''
    if (priceRef.current) priceRef.current.value = ''
  }

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex gap-4 text-sm text-foreground">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="mode"
                value="series"
                checked={mode === 'series'}
                onChange={() => setMode('series')}
                className="accent-primary"
              />
              {t('seriesModeLabel')}
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="mode"
                value="bundle"
                checked={mode === 'bundle'}
                onChange={() => setMode('bundle')}
                className="accent-primary"
              />
              {t('bundleModeLabel')}
            </label>
          </div>
          <Input ref={baseNameRef} name="baseName" placeholder={t('baseNamePlaceholder')} required />
          <div className="flex gap-2">
            <Input ref={startVolumeRef} name="startVolume" type="number" min="1" placeholder={t('startVolPlaceholder')} required />
            <Input ref={endVolumeRef} name="endVolume" type="number" min="1" placeholder={t('endVolPlaceholder')} required />
          </div>
          <Input ref={priceRef} name="price" type="number" step="0.01" min="0.01" placeholder={t('pricePerItemPlaceholder')} required />
          <select
            name="categoryId"
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={cn(
              'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              name="isAgeRestricted"
              type="checkbox"
              checked={isAgeRestricted}
              onChange={(e) => setIsAgeRestricted(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            {t('k18Label')}
          </label>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit">{mode === 'series' ? t('submitButtonSeries') : t('submitButtonBundle')}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
