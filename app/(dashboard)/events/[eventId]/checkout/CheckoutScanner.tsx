'use client'

import { useState, useRef, useEffect } from 'react'
import { lookupCode, confirmSale } from '@/actions/sales'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

type LookupResult = { itemId: string; name: string; price: string; sellerAlias: string; status: string }

export function CheckoutScanner({ eventId }: { eventId: string }) {
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
      setMessage(`Already sold: ${result.data.name}`)
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
    setMessage(result.ok ? `Sold: ${lookup.name}` : result.error.message)
    setLookup(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">Checkout</h1>
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
        className="max-w-sm text-lg"
        placeholder="Scan or type code, then Enter"
      />

      {lookup && (
        <Card className="max-w-sm">
          <CardContent className="pt-6">
            <p className="text-foreground">
              Selling <strong>{lookup.name}</strong> ({lookup.price} €, {lookup.sellerAlias}). Confirm?
            </p>
            <Button onClick={handleConfirm} disabled={pending} className="mt-3">
              Confirm (Enter)
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
