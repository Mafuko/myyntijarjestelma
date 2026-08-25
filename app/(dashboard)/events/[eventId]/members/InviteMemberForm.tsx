'use client'

import { useState } from 'react'
import { inviteMember } from '@/actions/events'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

export function InviteMemberForm({ eventId }: { eventId: string }) {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await inviteMember(eventId, formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
  }

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Invite a member</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="flex flex-col gap-3">
          <Input name="name" placeholder="Name" required />
          <Input name="email" type="email" placeholder="Email" required />
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
            <option value="SELLER">Myyjä</option>
            <option value="STAFF">Työvoima</option>
            <option value="ADMIN">Ylläpitäjä</option>
          </select>
          <Input name="sellerAlias" placeholder="Seller alias (required for Myyjä)" />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit">Invite</Button>
        </form>
      </CardContent>
    </Card>
  )
}
