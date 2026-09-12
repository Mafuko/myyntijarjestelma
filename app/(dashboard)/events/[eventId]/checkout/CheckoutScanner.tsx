'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { lookupCode, confirmSale } from '@/actions/sales'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

type LookupResult = { itemId: string; name: string; price: string; sellerAlias: string; status: string }

export function CheckoutScanner({ eventId }: { eventId: string }) {
  const t = useTranslations('CheckoutScanner')
  const [code, setCode] = useState('')
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [lookup])

  async function handleCodeSubmit() {
    if (!code.trim()) return
    setMessage(null)
    const result = await lookupCode(eventId, code.trim())
    setCode('')
    if (!result.ok) {
      setMessage(result.error.message)
      setLookup(null)
      return
    }
    if (result.data.status === 'SOLD') {
      setMessage(t('alreadySold', { name: result.data.name }))
      setLookup(null)
      return
    }
    setLookup(result.data)
  }

  async function handleConfirm() {
    if (!lookup) return
    setPending(true)
    const result = await confirmSale(eventId, lookup.itemId, 'BARCODE_SCAN')
    setPending(false)
    setMessage(result.ok ? t('sold', { name: lookup.name }) : result.error.message)
    setLookup(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
      {/* Inline Card, not a Dialog: focus must stay in this input across both
          lookup and confirm so a second Enter reaches handleConfirm below. */}
      <Input
        ref={inputRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (lookup) handleConfirm()
          else handleCodeSubmit()
        }}
        autoFocus
        className="h-11 max-w-sm text-lg"
        placeholder={t('scanPlaceholder')}
      />

      {lookup && (
        <Card className="max-w-sm">
          <CardContent className="pt-6">
            <p className="text-foreground">
              {t.rich('sellingConfirm', {
                b: (chunks) => <strong>{chunks}</strong>,
                name: lookup.name,
                price: lookup.price,
                sellerAlias: lookup.sellerAlias,
              })}
            </p>
            <Button onClick={handleConfirm} disabled={pending} className="mt-3">
              {t('confirmButton')}
            </Button>
          </CardContent>
        </Card>
      )}

      {message && (
        <Alert className="max-w-sm">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
