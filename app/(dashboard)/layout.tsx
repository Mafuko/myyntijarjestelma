import type { ReactNode } from 'react'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { logout } from '@/actions/auth'
import { getLatestVisibleReleaseNote } from '@/lib/services/release-notes'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/BackButton'
import { LocaleToggle } from '@/components/LocaleToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ReleaseNoteBanner } from '@/components/ReleaseNoteBanner'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  const t = await getTranslations('DashboardLayout')
  const locale = await getLocale()
  const note = session?.user?.id ? await getLatestVisibleReleaseNote(session.user.id) : null

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3">
          <div className="flex items-center gap-2">
            {session?.user && <BackButton />}
            <Link href="/events" className="font-mono text-sm font-semibold uppercase tracking-wide text-foreground">
              Myyntijärjestelmä
            </Link>
          </div>
          <div className="flex min-w-0 items-center gap-4 text-sm">
            <ThemeToggle />
            <LocaleToggle />
            {session?.user && (
              <>
                <span className="min-w-0 truncate font-mono text-muted-foreground">{session.user.email}</span>
                <form action={logout}>
                  <Button type="submit" variant="outline" size="sm">
                    {t('signOut')}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        {note && <ReleaseNoteBanner date={note.date} text={locale === 'fi' ? note.fi : note.en} />}
        {children}
      </main>
    </div>
  )
}
