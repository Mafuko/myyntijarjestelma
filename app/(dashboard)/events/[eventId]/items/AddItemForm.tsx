'use client'

import { useRef, useState } from 'react'
import { createItem } from '@/actions/items'

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
    <form onSubmit={handleSubmit} className="mt-8 flex max-w-sm flex-col gap-3">
      <h2 className="font-medium">Add an item</h2>
      <input ref={nameRef} name="name" placeholder="Item name" required className="rounded border px-2 py-1" />
      <input
        ref={priceRef}
        name="price"
        type="number"
        step="0.01"
        min="0.01"
        placeholder="Price"
        required
        className="rounded border px-2 py-1"
      />
      <select
        name="categoryId"
        required
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="rounded border px-2 py-1"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input
          name="isAgeRestricted"
          type="checkbox"
          checked={isAgeRestricted}
          onChange={(e) => setIsAgeRestricted(e.target.checked)}
        />
        K-18
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <button type="submit" className="rounded bg-black px-4 py-2 text-white">
        Add item
      </button>
    </form>
  )
}
