'use client'

import { useRef, useState } from 'react'
import { createItem } from '@/actions/items'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

type Category = { id: string; name: string }

export function AddItemForm({ eventId, categories }: { eventId: string; categories: Category[] }) {
  const [error, setError] = useState<string | null>(null)
  // Category and K-18 are kept as controlled state so they persist across
  // submissions (quick-repeat entry) regardless of any browser/React form
  // auto-reset behavior. Name and price are uncontrolled and cleared
  // explicitly after a successful submit.
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [isAgeRestricted, setIsAgeRestricted] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)

  // A plain onSubmit handler (rather than the `action` prop) is used
  // deliberately: React's form-action machinery automatically resets the
  // <form> after a successful action, which forces the checkbox back to
  // unchecked at the DOM level even though it's React-controlled (the
  // native reset bypasses React's reconciliation). That would silently
  // break the quick-repeat behavior below. onSubmit + preventDefault avoids
  // that auto-reset entirely, so the controlled category/K-18 state is the
  // only thing driving what's displayed.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const result = await createItem(eventId, formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setError(null)
    if (nameRef.current) nameRef.current.value = ''
    if (priceRef.current) priceRef.current.value = ''
  }

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Add an item</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input ref={nameRef} name="name" placeholder="Item name" required />
          <Input ref={priceRef} name="price" type="number" step="0.01" min="0.01" placeholder="Price" required />
          {/* Native <select>, not a Select component — items-quickrepeat.spec.ts
              drives this via page.selectOption('select[name="categoryId"]', ...). */}
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
            {/* Native checkbox, not a Checkbox component — same test drives
                this via page.locator('input[name="isAgeRestricted"]').check(). */}
            <input
              name="isAgeRestricted"
              type="checkbox"
              checked={isAgeRestricted}
              onChange={(e) => setIsAgeRestricted(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            K-18
          </label>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit">Add item</Button>
        </form>
      </CardContent>
    </Card>
  )
}
