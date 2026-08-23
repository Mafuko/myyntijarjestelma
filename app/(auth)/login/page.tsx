'use client'

import { useState } from 'react'
import { login } from '@/actions/auth'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await login(formData)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    window.location.href = result.data.redirectTo
  }

  return (
    <form action={handleSubmit} className="mx-auto mt-20 flex max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">Log in</h1>
      <label className="flex flex-col gap-1">
        Email
        <input name="email" type="email" required className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Password
        <input name="password" type="password" required className="rounded border px-2 py-1" />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <button type="submit" className="rounded bg-black px-4 py-2 text-white">
        Log in
      </button>
    </form>
  )
}
