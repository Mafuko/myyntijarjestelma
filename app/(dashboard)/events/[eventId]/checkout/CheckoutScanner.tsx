'use client'

import { useState, useRef, useEffect } from 'react'
import { lookupCode, confirmSale } from '@/actions/sales'

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
    <div className="p-8">
      <h1 className="text-xl font-semibold">Checkout</h1>
      <input
        ref={inputRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (lookup) handleConfirm()
          else handleCodeSubmit()
        }}
        autoFocus
        className="mt-4 w-full max-w-sm rounded border px-3 py-2 text-lg"
        placeholder="Scan or type code, then Enter"
      />

      {lookup && (
        <div className="mt-4 rounded border p-4">
          <p>
            Selling <strong>{lookup.name}</strong> ({lookup.price} €, {lookup.sellerAlias}). Confirm?
          </p>
          <button onClick={handleConfirm} disabled={pending} className="mt-2 rounded bg-black px-4 py-2 text-white">
            Confirm (Enter)
          </button>
        </div>
      )}

      {message && <p className="mt-4">{message}</p>}
    </div>
  )
}
