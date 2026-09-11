'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

// The app has no email sending (see docs/superpowers/specs/2026-08-22-myyntijarjestelma-design.md#L144)
// — admins are meant to share this link with the invitee themselves, so it
// needs to be an absolute URL usable outside the app. window.location.origin
// (rather than a server-known host) means it's always correct for whatever
// domain the admin is currently browsing on.
export function CopyInviteLink({ path }: { path: string }) {
  const t = useTranslations('CopyInviteLink')
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
      {copied ? t('copied') : t('copyLink')}
    </Button>
  )
}
