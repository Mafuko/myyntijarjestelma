'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { inviteMember } from '@/actions/events'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { CopyInviteLink } from './CopyInviteLink'

export function InviteMemberForm({ eventId }: { eventId: string }) {
  const t = useTranslations('InviteMemberForm')
  const tRoles = useTranslations('Roles')
  const [error, setError] = useState<string | null>(null)
  // undefined: no invite sent yet. null: sent, but the invitee already had an
  // account with a password (inviteUser only issues a token for brand-new or
  // not-yet-activated users), so there's no link to share — they just log in.
  const [invited, setInvited] = useState<{ inviteUrl: string | null } | undefined>(undefined)

  async function handleSubmit(formData: FormData) {
    const result = await inviteMember(eventId, formData)
    if (!result.ok) {
      setError(result.error.message)
      setInvited(undefined)
      return
    }
    setError(null)
    setInvited(result.data)
  }

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="flex flex-col gap-3">
          <Input name="name" placeholder={t('namePlaceholder')} required />
          <Input name="email" type="email" placeholder={t('emailPlaceholder')} required />
          {/* Native <select>, not a Select component — events.spec.ts drives
              this via page.selectOption('select[name="role"]', 'SELLER'). */}
          <select
            name="role"
            required
            className={cn(
              'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <option value="SELLER">{tRoles('SELLER')}</option>
            <option value="STAFF">{tRoles('STAFF')}</option>
            <option value="ADMIN">{tRoles('ADMIN')}</option>
          </select>
          <Input name="sellerAlias" placeholder={t('sellerAliasPlaceholder')} />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit">{t('submitButton')}</Button>
        </form>
        {invited !== undefined && (
          <Alert variant="success" className="mt-3">
            <AlertDescription>
              {invited.inviteUrl ? (
                <div className="flex flex-col items-start gap-2">
                  <span>{t('invitedWithLink')}</span>
                  <CopyInviteLink path={invited.inviteUrl} />
                </div>
              ) : (
                t('invitedWithoutLink')
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
