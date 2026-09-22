'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { login } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LocaleToggle } from '@/components/LocaleToggle'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function LoginPage() {
  const [error, setError] = useState<{ code: string; message: string; params?: Record<string, string | number> } | null>(null)
  const t = useTranslations('Login')
  const tErrors = useTranslations('ServiceErrors')

  async function handleSubmit(formData: FormData) {
    const result = await login(formData)
    if (!result.ok) {
      setError(result.error)
      return
    }
    window.location.href = result.data.redirectTo
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{t('title')}</CardTitle>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LocaleToggle />
          </div>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t('emailLabel')}</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <PasswordInput id="password" name="password" required />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{tErrors(error.code, error.params)}</AlertDescription>
              </Alert>
            )}
            <Button type="submit">{t('submitButton')}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
